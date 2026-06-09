import { getJSON } from '../http.mjs';

const FIELDS = 'title,abstract,authors,year,publicationDate,citationCount,' +
  'influentialCitationCount,tldr,openAccessPdf,externalIds,venue,fieldsOfStudy';

export function buildUrl(query, { max = 40, since } = {}) {
  const q = encodeURIComponent(query.trim());
  const year = since ? `&year=${String(since).slice(0, 4)}-` : '';
  const limit = Math.min(100, Math.max(1, max)); // S2 search caps limit at 100
  return `https://api.semanticscholar.org/graph/v1/paper/search?query=${q}` +
         `&limit=${limit}&fields=${FIELDS}${year}`;
}

export function mapS2(data) {
  const rows = (data && data.data) || [];
  return rows.map((r) => {
    const doi = r.externalIds?.DOI ? String(r.externalIds.DOI).toLowerCase() : null;
    const arxivId = r.externalIds?.ArXiv || null;
    return {
      id: doi ? `doi:${doi}` : arxivId ? `arxiv:${arxivId}` : `s2:${r.paperId}`,
      title: r.title || null,
      authors: (r.authors || []).map((a) => a.name).filter(Boolean),
      abstract: r.abstract || null,
      tldr: r.tldr?.text || null,
      publishedDate: r.publicationDate || (r.year ? `${r.year}-01-01` : null),
      year: r.year || null,
      venue: r.venue || null,
      citationCount: r.citationCount || 0,
      influentialCitationCount: r.influentialCitationCount ?? null,
      fields: r.fieldsOfStudy || [],
      sources: ['s2'],
      arxivId,
      doi,
      links: {
        pdf: r.openAccessPdf?.url || null,
        arxiv: arxivId ? `https://arxiv.org/abs/${arxivId}` : null,
        doi: doi ? `https://doi.org/${doi}` : null,
        landing: r.paperId ? `https://www.semanticscholar.org/paper/${r.paperId}` : null,
      },
    };
  });
}

export async function fetchS2(query, opts) {
  const key = process.env.S2_API_KEY;
  const data = await getJSON(buildUrl(query, opts), {
    headers: key ? { 'x-api-key': key } : {},
    retries: 4,
    baseDelay: 1500,
  });
  return data ? mapS2(data) : [];
}
