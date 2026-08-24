import {
  paperPrompt, PAPER_SCHEMA,
  clusterPrompt, CLUSTER_SCHEMA,
  deepDivePrompt, DEEPDIVE_SCHEMA,
  trendingPrompt, TRENDING_SCHEMA,
  readingPathPrompt, READING_PATH_SCHEMA,
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
async function mapLimit(items, limit, fn, onError = () => {}) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); }
      catch (err) { out[idx] = null; onError(err, items[idx]); }
    }
  });
  await Promise.all(workers);
  return out;
}

// Enrich a raw fetch result into the papers.enriched.json shape. `client` exposes
// complete({system,prompt,schema}) → {ok,data}; `fetchFullText` and `log` are
// injected so this is fully testable with mocks and no network.
export async function enrichAll({ raw, client, fetchFullText, expandRelated = null, related = 0,
                                  today, deep = 5, maxConcurrency = 4, log = () => {} }) {
  const topic = (raw.meta && raw.meta.topic) || raw.meta?.query || 'research';
  const since = raw.meta && raw.meta.since;
  const rawPapers = Array.isArray(raw.papers) ? raw.papers : [];

  // ---- Pass 1: per-paper enrichment (partial failure ≠ abort) ----
  let pass1Failures = 0;
  let pass1LastError = '';
  const enriched = await mapLimit(rawPapers, maxConcurrency, async (p) => {
    const r = await client.complete({ prompt: paperPrompt(topic, p), schema: PAPER_SCHEMA });
    if (!r.ok) { pass1Failures++; pass1LastError = r.error || 'unknown error'; }
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
  }, (err, p) => log(`enrichment dropped ${p && p.id}: ${err.message || err}`));

  // A run where every model call failed (bad key, wrong model, no network) must
  // not masquerade as success — the output would be placeholder annotations with
  // default relevance on every paper.
  if (rawPapers.length && pass1Failures === rawPapers.length) {
    throw new Error(`all ${rawPapers.length} enrichment calls failed — ${pass1LastError}`);
  }
  if (pass1Failures) {
    log(`${pass1Failures} of ${rawPapers.length} paper enrichments failed (last: ${pass1LastError}) — those papers keep default annotations`);
  }

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
  if (!cr.ok) log(`clustering pass failed (${cr.error}) — falling back to a single group`);
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

  // ---- Pass 2b: reading path (ordered on-ramp for a newcomer) ----
  // Candidates are the top papers by score; the model orders 3-5 of them and says why.
  // Only real ids survive — an invented or duplicate id is dropped, and a failed pass
  // degrades to an empty path (the reader simply omits the section).
  let readingPath = [];
  if (kept.length >= 2) {
    const candidates = kept.slice(0, Math.max(mustReadCount, Math.min(8, kept.length)));
    const rp = await client.complete({ prompt: readingPathPrompt(topic, candidates), schema: READING_PATH_SCHEMA });
    if (!rp.ok) log(`reading-path pass failed (${rp.error}) — the reader will omit the section`);
    if (rp.ok && rp.data && Array.isArray(rp.data.readingPath)) {
      const seen = new Set();
      readingPath = rp.data.readingPath
        .map((s) => ({ id: str(s && s.id), why: str(s && s.why) }))
        .filter((s) => s.id && validIds.has(s.id) && !seen.has(s.id) && seen.add(s.id))
        .slice(0, 5);
    }
  }

  // ---- Pass 3: deep-dive the top `deep` must-reads (full text) ----
  const deepTargets = kept.filter((p) => p.mustRead).slice(0, Math.max(0, deep));
  for (const p of deepTargets) {
    try {
      const { text, source } = await fetchFullText(p, { log });
      const r = await client.complete({ prompt: deepDivePrompt(p, text, source), schema: DEEPDIVE_SCHEMA });
      const d = r.ok && r.data ? r.data : null;
      // `fullText` must reflect what actually informed the dive: a failed model
      // call yields no analysis, so labeling it 'read' would fabricate success.
      if (!d) log(`deep-dive analysis failed for ${p.id}: ${r.error || 'empty response'}`);
      p.deepDive = {
        findings: arr(d && d.findings),
        method: str(d && d.method),
        limitations: arr(d && d.limitations),
        fullText: !d ? 'unavailable' : source === 'abstract' ? 'abstract' : 'read',
      };
    } catch (err) {
      log(`deep-dive failed for ${p.id}: ${err.message || err}`);
      p.deepDive = { findings: [], method: '', limitations: [], fullText: 'unavailable' };
    }
  }

  // ---- Pass 3b (optional): citation-graph related work ----
  // Off unless an expander is supplied and related>0. Deterministic (no LLM); attaches
  // each must-read's most-cited references. A failure leaves `related` empty, never aborts.
  if (expandRelated && related > 0) {
    const targets = kept.filter((p) => p.mustRead);
    for (const p of targets) {
      try { p.related = await expandRelated(p, { max: related }); }
      catch (err) { log(`related-work expansion failed for ${p.id}: ${err.message || err}`); p.related = []; }
    }
  }

  // ---- Pass 4: trending synthesis ----
  let trending = '';
  const tr = await client.complete({ prompt: trendingPrompt(topic, clusters), schema: TRENDING_SCHEMA });
  if (!tr.ok) log(`trending pass failed (${tr.error}) — leaving it empty`);
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
    readingPath,
    papers: kept,
  };
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const arr = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
