import { normalizeTitle } from './slug.mjs';

const keysFor = (p) => {
  const ks = [];
  if (p.doi) ks.push(`doi:${p.doi.toLowerCase()}`);
  if (p.arxivId) ks.push(`arxiv:${p.arxivId}`);
  ks.push(`title:${normalizeTitle(p.title || '')}`);
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

export function dedupeMerge(papers) {
  const byKey = new Map(); // key -> index into result
  const result = []; // entries; absorbed ones are tombstoned to null
  for (const p of papers) {
    const ks = keysFor(p);
    // A record can match MULTIPLE existing entries (it "bridges" them, e.g. carries
    // both a DOI matching entry i and an arXiv id matching entry j). Union them all.
    const hits = [...new Set(ks.map((k) => byKey.get(k)).filter((i) => i !== undefined && result[i]))];
    if (hits.length === 0) {
      const idx = result.push(p) - 1;
      for (const k of ks) byKey.set(k, idx);
      continue;
    }
    const target = Math.min(...hits);
    const reKeys = new Set(ks);
    let merged = merge(result[target], p);
    for (const h of hits) {
      if (h === target) continue;
      for (const k of keysFor(result[h])) reKeys.add(k);
      merged = merge(merged, result[h]);
      result[h] = null; // absorbed
    }
    result[target] = merged;
    for (const k of keysFor(merged)) reKeys.add(k);
    for (const k of reKeys) byKey.set(k, target);
  }
  return result.filter(Boolean);
}
