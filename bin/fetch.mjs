#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fetchArxiv } from '../lib/sources/arxiv.mjs';
import { fetchS2 } from '../lib/sources/semanticscholar.mjs';
import { fetchOpenAlex } from '../lib/sources/openalex.mjs';
import { dedupeMerge } from '../lib/dedup.mjs';
import { slugify } from '../lib/slug.mjs';

// round-robin merge of N already-ranked lists: a0,b0,c0,a1,b1,c1,...
function interleave(lists) {
  const out = [];
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

function parseArgs(argv) {
  const o = { max: 40 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--query') o.query = argv[++i];
    else if (a === '--since') o.since = argv[++i];
    else if (a === '--max') { const n = Number(argv[++i]); o.max = Number.isFinite(n) && n > 0 ? Math.floor(n) : 40; }
    else if (a === '--out') o.out = argv[++i];
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.query) { console.error('paper-boy fetch: --query is required'); process.exit(2); }
  // A malformed --since would fail differently per source (OpenAlex 400s and
  // contributes 0, arXiv silently ignores the bound) — reject it up front instead.
  if (o.since && !(/^\d{4}-\d{2}-\d{2}$/.test(o.since) && Number.isFinite(Date.parse(o.since)))) {
    console.error(`paper-boy fetch: --since must be YYYY-MM-DD (got "${o.since}")`);
    process.exit(2);
  }

  const per = Math.max(o.max, 25); // over-fetch per source for a strong candidate pool
  const until = new Date().toISOString().slice(0, 10); // upper date bound (OpenAlex uses it to drop future-dated junk; arXiv sorts by date, S2 has no upper bound)
  const opts = { max: per, since: o.since, until };
  const settled = await Promise.allSettled([
    fetchArxiv(o.query, opts),
    fetchS2(o.query, opts),
    fetchOpenAlex(o.query, opts),
  ]);
  // A source returning null (or throwing) FAILED — that's different from a real
  // empty result, and "S2 0" alone would hide it. Warn per source; if every
  // source failed the run has no data at all, so don't write an empty file as if
  // nothing matched.
  const names = ['arXiv', 'Semantic Scholar', 'OpenAlex'];
  const vals = settled.map((s) => (s.status === 'fulfilled' ? s.value : null));
  vals.forEach((v, i) => {
    if (v === null) console.error(`paper-boy: warning — ${names[i]} query failed (network/HTTP error), continuing without it`);
  });
  if (vals.every((v) => v === null)) {
    console.error('paper-boy fetch: all sources failed — check your network and try again');
    process.exit(1);
  }
  const [arx, s2, oa] = vals.map((v) => v || []);

  // Round-robin interleave preserves each source's own ranking (arXiv=fresh, S2=relevance,
  // OpenAlex=fresh) so no single source's top picks get crowded out. The LLM does the real
  // relevance ranking afterwards — fetch must NOT pre-trim by date and discard relevance.
  const merged = dedupeMerge(interleave([arx, s2, oa]));
  // Candidate pool: some headroom over --max for the enrich stage to filter, soft-capped
  // at 80 to bound LLM cost — but an explicit --max above 80 is always honored.
  const poolMax = Math.max(o.max, Math.min(80, Math.max(o.max + 20, Math.ceil(o.max * 1.5))));
  const papers = merged.slice(0, poolMax);

  const out = {
    meta: {
      topic: o.query,
      query: o.query,
      slug: slugify(o.query),
      since: o.since || null,
      sources: { arxiv: arx.length, s2: s2.length, openalex: oa.length },
      total: papers.length,
    },
    papers,
  };

  const dest = o.out || 'papers.raw.json';
  mkdirSync(dirname(dest) || '.', { recursive: true });
  writeFileSync(dest, JSON.stringify(out, null, 2));
  console.error(
    `paper-boy: arXiv ${arx.length} · S2 ${s2.length} · OpenAlex ${oa.length} ` +
    `→ ${papers.length} unique candidates → ${dest}`,
  );
}

main();
