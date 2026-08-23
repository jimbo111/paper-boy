import { normalizeTitle } from './slug.mjs';

const keysFor = (p) => {
  const ks = [];
  if (p.doi) ks.push(`doi:${p.doi.toLowerCase()}`);
  if (p.arxivId) ks.push(`arxiv:${p.arxivId}`);
  // An empty normalized title would give every untitled paper the same key
  // and wrongly merge distinct records — only key on real titles.
  const t = normalizeTitle(p.title || '');
  if (t) ks.push(`title:${t}`);
  return ks;
};

const longer = (a, b) => ((b || '').length > (a || '').length ? b : a);

function merge(a, b) {
  return {
    ...a,
    title: a.title || b.title,
    authors: (a.authors?.length ? a.authors : b.authors) || [],
    abstract: longer(a.abstract, b.abstract),
    tldr: a.tldr || b.tldr,
    publishedDate: a.publishedDate || b.publishedDate,
    year: a.year || b.year,
    venue: a.venue || b.venue,
    citationCount: Math.max(a.citationCount || 0, b.citationCount || 0),
    influentialCitationCount: a.influentialCitationCount ?? b.influentialCitationCount,
    fields: [...new Set([...(a.fields || []), ...(b.fields || [])])],
    sources: [...new Set([...(a.sources || []), ...(b.sources || [])])],
    arxivId: a.arxivId || b.arxivId,
    doi: a.doi || b.doi,
    links: {
      pdf: a.links.pdf || b.links.pdf,
      arxiv: a.links.arxiv || b.links.arxiv,
      doi: a.links.doi || b.links.doi,
      landing: a.links.landing || b.links.landing,
    },
  };
}

// Distinct papers legitimately share titles ("Editorial", eponymous surveys) —
// a title-only match additionally requires compatible years to merge.
const yearsCompatible = (a, b) => !a.year || !b.year || Math.abs(a.year - b.year) <= 1;

export function dedupeMerge(papers) {
  const byKey = new Map(); // key -> index into result
  const result = []; // entries; absorbed ones are tombstoned to null
  for (const p of papers) {
    const ks = keysFor(p);
    // A record can match MULTIPLE existing entries (it "bridges" them, e.g. carries
    // both a DOI matching entry i and an arXiv id matching entry j). Union them all.
    // Identifier keys (doi/arxiv) always match; title keys only across compatible years.
    const hits = [...new Set(ks.map((k) => {
      const i = byKey.get(k);
      if (i === undefined || !result[i]) return undefined;
      if (k.startsWith('title:') && !yearsCompatible(p, result[i])) return undefined;
      return i;
    }).filter((i) => i !== undefined))];
    if (hits.length === 0) {
      const idx = result.push(p) - 1;
      for (const k of ks) byKey.set(k, idx);
      continue;
    }
    const target = Math.min(...hits);
    let merged = merge(result[target], p);
    for (const h of hits) {
      if (h === target) continue;
      merged = merge(merged, result[h]);
      result[h] = null; // absorbed
      // Repoint EVERY key that referenced the absorbed entry — including alternate
      // titles registered by records merged into it earlier, which keysFor() of the
      // merged record can no longer derive. A stale key would resurrect the paper
      // as a duplicate on the next match.
      for (const [k, idx] of byKey) if (idx === h) byKey.set(k, target);
    }
    result[target] = merged;
    for (const k of ks) byKey.set(k, target);
    for (const k of keysFor(merged)) byKey.set(k, target);
  }
  return result.filter(Boolean);
}
