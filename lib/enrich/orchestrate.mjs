import {
  paperPrompt, PAPER_SCHEMA,
  clusterPrompt, CLUSTER_SCHEMA,
  deepDivePrompt, DEEPDIVE_SCHEMA,
  trendingPrompt, TRENDING_SCHEMA,
} from './prompts.mjs';

const RELEVANCE_FLOOR = 0.35;

// Newer papers score higher: ~1.0 now, decaying toward ~0.5 at the since edge.
function recencyDecay(publishedDate, since, today) {
  if (!publishedDate) return 0.75;
  const pub = Date.parse(publishedDate);
  const now = Date.parse(today);
  const lo = since ? Date.parse(since) : now - 18 * 30 * 864e5;
  if (!Number.isFinite(pub) || !Number.isFinite(now) || !Number.isFinite(lo) || now <= lo) return 0.75;
  const frac = Math.max(0, Math.min(1, (pub - lo) / (now - lo)));
  return 0.5 + 0.5 * frac;
}

const citationBoost = (n) => 1 + Math.log10(1 + Math.max(0, n || 0)) / 2;

// Run an array of async unit-jobs with bounded concurrency, never rejecting:
// a thrown job leaves its slot null. (The client already serialises via its own
// limiter, but this keeps orchestration independent of that.)
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); }
      catch { out[idx] = null; }
    }
  });
  await Promise.all(workers);
  return out;
}

// Enrich a raw fetch result into the papers.enriched.json shape. `client` exposes
// complete({system,prompt,schema}) → {ok,data}; `fetchFullText` and `log` are
// injected so this is fully testable with mocks and no network.
export async function enrichAll({ raw, client, fetchFullText, today, deep = 5, maxConcurrency = 4, log = () => {} }) {
  const topic = (raw.meta && raw.meta.topic) || raw.meta?.query || 'research';
  const since = raw.meta && raw.meta.since;
  const rawPapers = Array.isArray(raw.papers) ? raw.papers : [];

  // ---- Pass 1: per-paper enrichment (partial failure ≠ abort) ----
  const enriched = await mapLimit(rawPapers, maxConcurrency, async (p) => {
    const r = await client.complete({ prompt: paperPrompt(topic, p), schema: PAPER_SCHEMA });
    const e = r.ok && r.data ? r.data : {};
    const relevance = clamp01(num(e.relevance, 0.5));
    const score = relevance
      * recencyDecay(p.publishedDate, since, today)
      * citationBoost(p.citationCount);
    return {
      ...p, // every original field passes through unchanged
      whatsNew: str(e.whatsNew),
      whyItMatters: str(e.whyItMatters),
      summary: str(e.summary) || str(p.tldr) || str(p.abstract).slice(0, 280),
      clusters: [],
      relevance,
      score: Number(score.toFixed(4)),
      mustRead: false,
      deepDive: null,
    };
  });

  // Drop low-relevance noise, sort by score.
  let kept = enriched.filter((p) => p && p.relevance >= RELEVANCE_FLOOR);
  if (!kept.length) kept = enriched.filter(Boolean); // never return an empty reader
  kept.sort((a, b) => b.score - a.score);

  // Flag the top 3-5 as must-reads.
  const mustReadCount = Math.min(5, Math.max(Math.min(3, kept.length), Math.ceil(kept.length * 0.15)));
  const startHere = [];
  kept.slice(0, mustReadCount).forEach((p) => { p.mustRead = true; startHere.push(p.id); });

  const validIds = new Set(kept.map((p) => p.id));

  // ---- Pass 2: clustering ----
  let clusters = [];
  const cr = await client.complete({ prompt: clusterPrompt(topic, kept), schema: CLUSTER_SCHEMA });
  if (cr.ok && cr.data && Array.isArray(cr.data.clusters)) {
    clusters = cr.data.clusters
      .map((c) => ({
        name: str(c.name),
        synthesis: str(c.synthesis),
        // Drop any id the model invented — only real papers may be referenced.
        paperIds: (Array.isArray(c.paperIds) ? c.paperIds : []).filter((id) => validIds.has(id)),
      }))
      .filter((c) => c.name && c.paperIds.length);
  }
  if (!clusters.length) {
    clusters = [{ name: 'All results', synthesis: '', paperIds: kept.map((p) => p.id) }];
  }
  // Back-fill each paper's cluster membership.
  const byId = new Map(kept.map((p) => [p.id, p]));
  for (const c of clusters) for (const id of c.paperIds) {
    const p = byId.get(id);
    if (p && !p.clusters.includes(c.name)) p.clusters.push(c.name);
  }

  // ---- Pass 3: deep-dive the top `deep` must-reads (full text) ----
  const deepTargets = kept.filter((p) => p.mustRead).slice(0, Math.max(0, deep));
  for (const p of deepTargets) {
    try {
      const { text, source } = await fetchFullText(p, { log });
      const r = await client.complete({ prompt: deepDivePrompt(p, text, source), schema: DEEPDIVE_SCHEMA });
      const d = r.ok && r.data ? r.data : null;
      p.deepDive = {
        findings: arr(d && d.findings),
        method: str(d && d.method),
        limitations: arr(d && d.limitations),
        fullText: source === 'abstract' ? 'abstract' : 'read',
      };
    } catch (err) {
      log(`deep-dive failed for ${p.id}: ${err.message || err}`);
      p.deepDive = { findings: [], method: '', limitations: [], fullText: 'unavailable' };
    }
  }

  // ---- Pass 4: trending synthesis ----
  let trending = '';
  const tr = await client.complete({ prompt: trendingPrompt(topic, clusters), schema: TRENDING_SCHEMA });
  if (tr.ok && tr.data) trending = str(tr.data.trending);

  return {
    meta: {
      ...(raw.meta || {}),
      topic,
      generatedAt: today,
      total: kept.length,
    },
    trending,
    clusters,
    startHere,
    papers: kept,
  };
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const arr = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
