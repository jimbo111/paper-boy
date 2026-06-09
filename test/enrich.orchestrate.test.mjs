import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { enrichAll } from '../lib/enrich/orchestrate.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const raw = JSON.parse(readFileSync(`${ROOT}/fixtures/papers.raw.sample.json`, 'utf8'));

// A mock client routing on schema.required. `opts` can force per-paper failures or
// inject a bogus cluster id to prove it gets dropped.
function mockClient({ failTitles = new Set(), injectBadId = false } = {}) {
  let paperCalls = 0;
  return {
    model: 'mock',
    async complete({ prompt = '', schema }) {
      if (!schema) return { ok: true, data: 'x' };
      const req = schema.required;
      if (req.includes('whatsNew')) {
        paperCalls++;
        const fail = [...failTitles].some((t) => prompt.includes(t));
        if (fail) return { ok: false, error: 'simulated paper failure' };
        return { ok: true, data: { whatsNew: 'new', whyItMatters: 'matters', summary: 'a grounded summary.', relevance: 0.9 } };
      }
      if (req.includes('clusters')) {
        const ids = [...prompt.matchAll(/^- (\S+):/gm)].map((m) => m[1]);
        const paperIds = injectBadId ? [...ids, 'arxiv:DOES-NOT-EXIST'] : ids;
        return { ok: true, data: { clusters: [{ name: 'Theme', synthesis: 's', paperIds }] } };
      }
      if (req.includes('findings')) return { ok: true, data: { findings: ['f1'], method: 'm', limitations: ['l1'] } };
      if (req.includes('trending')) return { ok: true, data: { trending: 'rising' } };
      return { ok: false, error: 'unexpected schema' };
    },
    get paperCalls() { return paperCalls; },
  };
}

const fakeFullText = async (p) => ({ text: 'full text body', source: p.arxivId ? 'ar5iv' : 'abstract' });

test('produces the enriched schema shape', async () => {
  const out = await enrichAll({ raw, client: mockClient(), fetchFullText: fakeFullText, today: '2026-06-08', deep: 2 });
  assert.deepEqual(Object.keys(out).sort(), ['clusters', 'meta', 'papers', 'startHere', 'trending'].sort());
  assert.equal(out.meta.generatedAt, '2026-06-08');
  assert.equal(out.trending, 'rising');
  const p = out.papers[0];
  for (const k of ['whatsNew', 'whyItMatters', 'summary', 'relevance', 'score', 'mustRead', 'deepDive', 'clusters']) {
    assert.ok(k in p, `paper has ${k}`);
  }
  // original fields preserved
  assert.ok('title' in p && 'links' in p && 'authors' in p);
});

test('deep-dive limited to top-N must-reads; others stay null', async () => {
  const out = await enrichAll({ raw, client: mockClient(), fetchFullText: fakeFullText, today: '2026-06-08', deep: 2 });
  const dived = out.papers.filter((p) => p.deepDive);
  assert.ok(dived.length <= 2, 'at most --deep deep-dives');
  for (const p of dived) assert.ok(p.mustRead, 'only must-reads are dived');
});

test('cluster paperIds referencing unknown papers are dropped', async () => {
  const out = await enrichAll({ raw, client: mockClient({ injectBadId: true }), fetchFullText: fakeFullText, today: '2026-06-08' });
  const ids = new Set(out.papers.map((p) => p.id));
  for (const c of out.clusters) for (const id of c.paperIds) {
    assert.ok(ids.has(id), `cluster id ${id} references a real paper`);
  }
});

test('a per-paper failure does not abort and keeps raw fields', async () => {
  const title = raw.papers[0].title;
  const out = await enrichAll({ raw, client: mockClient({ failTitles: new Set([title]) }), fetchFullText: fakeFullText, today: '2026-06-08' });
  // The failed paper is still present with its original fields, enrichment defaulted.
  const failed = out.papers.find((p) => p.title === title);
  assert.ok(failed, 'failed paper still present');
  assert.equal(failed.whatsNew, '');
  assert.ok(failed.summary.length > 0, 'summary falls back to tldr/abstract');
  assert.ok(out.papers.length >= 1);
});

test('abstract-only deep-dive is flagged and not fabricated', async () => {
  const ft = async () => ({ text: 'abs', source: 'abstract' });
  const out = await enrichAll({ raw, client: mockClient(), fetchFullText: ft, today: '2026-06-08', deep: 1 });
  const dived = out.papers.find((p) => p.deepDive);
  assert.equal(dived.deepDive.fullText, 'abstract');
});
