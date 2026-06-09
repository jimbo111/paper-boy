import { getJSON } from '../http.mjs';

export function reconstructAbstract(inv) {
  if (!inv) return null;
  const positions = [];
  for (const [word, idxs] of Object.entries(inv)) for (const i of idxs) positions[i] = word;
  return positions.filter((w) => w !== undefined).join(' ') || null;
}

export function buildUrl(query, { max = 40, since, until, mailto } = {}) {
  const q = encodeURIComponent(query.trim());
  const parts = [];
  if (since) parts.push(`from_publication_date:${String(since).slice(0, 10)}`);
  if (until) parts.push(`to_publication_date:${String(until).slice(0, 10)}`); // drop future-dated junk
  const filter = parts.length ? `&filter=${parts.join(',')}` : '';
  const perPage = Math.min(200, Math.max(1, max)); // OpenAlex hard-caps per-page at 200
  // OpenAlex's "polite pool" wants a contact email — supplied per-user via
  // PAPER_BOY_MAILTO, never hardcoded into this shared tool. Omitted if unset.
  const contact = mailto ? `&mailto=${encodeURIComponent(mailto)}` : '';
  return `https://api.openalex.org/works?search=${q}${filter}` +
         `&per-page=${perPage}&sort=publication_date:desc${contact}`;
}

export function mapOpenAlex(data) {
  const rows = (data && data.results) || [];
  return rows.map((r) => {
    const doi = r.doi ? r.doi.replace('https://doi.org/', '').toLowerCase() : null;
    const arxivId = (r.ids?.arxiv || '').match(/abs\/(.+)$/)?.[1] || null;
    const pdf = r.primary_location?.pdf_url || r.open_access?.oa_url || null;
    return {
      id: doi ? `doi:${doi}` : `openalex:${(r.id || '').split('/').pop()}`,
      title: r.display_name || r.title || null,
      authors: (r.authorships || []).map((a) => a.author?.display_name).filter(Boolean),
      abstract: reconstructAbstract(r.abstract_inverted_index),
      tldr: null,
      publishedDate: r.publication_date || null,
      year: r.publication_year || null,
      venue: r.primary_location?.source?.display_name || null,
      citationCount: r.cited_by_count || 0,
      influentialCitationCount: null,
      fields: (r.concepts || []).slice(0, 5).map((c) => c.display_name),
      sources: ['openalex'],
      arxivId,
      doi,
      links: {
        pdf,
        arxiv: arxivId ? `https://arxiv.org/abs/${arxivId}` : null,
        doi: doi ? `https://doi.org/${doi}` : null,
        landing: r.primary_location?.landing_page_url || null,
      },
    };
  });
}

export async function fetchOpenAlex(query, opts = {}) {
  const mailto = opts.mailto || process.env.PAPER_BOY_MAILTO || undefined;
  const data = await getJSON(buildUrl(query, { ...opts, mailto }), { retries: 3, baseDelay: 1000 });
  return data ? mapOpenAlex(data) : [];
}
