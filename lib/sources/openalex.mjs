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

// ---- Citation-graph: a paper's referenced works (its bibliography) ----

const contactParam = (mailto) => (mailto ? `&mailto=${encodeURIComponent(mailto)}` : '');

// URL that resolves a single OpenAlex work from one of our paper ids. OpenAlex accepts
// a DOI or arXiv id directly in the path; otherwise we already hold its openalex id.
export function workLookupUrl(paper, mailto) {
  const base = 'https://api.openalex.org/works/';
  if (paper.doi) return `${base}https://doi.org/${paper.doi}?select=id,referenced_works${contactParam(mailto)}`;
  const oa = String(paper.id || '').startsWith('openalex:') ? paper.id.slice('openalex:'.length) : null;
  if (oa) return `${base}${oa}?select=id,referenced_works${contactParam(mailto)}`;
  if (paper.arxivId) return `${base}arxiv:${paper.arxivId}?select=id,referenced_works${contactParam(mailto)}`;
  return null;
}

// URL fetching metadata for a batch of openalex work ids (pipe-joined; OpenAlex caps a
// filter list at 50). Sorted most-cited first so "related work" surfaces the influential refs.
export function refsBatchUrl(workIds, { max = 10, mailto } = {}) {
  const ids = workIds.slice(0, 50).map((u) => String(u).split('/').pop()).join('|');
  return `https://api.openalex.org/works?filter=openalex_id:${ids}` +
         `&per-page=${Math.min(50, Math.max(1, max))}&sort=cited_by_count:desc${contactParam(mailto)}`;
}

// A compact "related work" record — enough to cite and click, nothing fabricated.
const slimRef = (p) => ({
  id: p.id, title: p.title, authors: (p.authors || []).slice(0, 6), year: p.year,
  venue: p.venue, doi: p.doi, citationCount: p.citationCount,
  link: (p.links && (p.links.doi || p.links.arxiv || p.links.landing)) || null,
});

// Pull up to `max` of a paper's most-cited references via the OpenAlex citation graph.
// Deterministic, no LLM. `getImpl` is injected for tests. Returns [] on any miss so an
// expansion failure never aborts the run.
export async function fetchRelated(paper, { max = 5, mailto, getImpl = getJSON } = {}) {
  const lookup = workLookupUrl(paper, mailto || process.env.PAPER_BOY_MAILTO);
  if (!lookup) return [];
  const work = await getImpl(lookup, { retries: 2, baseDelay: 800 });
  const refs = (work && work.referenced_works) || [];
  if (!refs.length) return [];
  const data = await getImpl(refsBatchUrl(refs, { max, mailto: mailto || process.env.PAPER_BOY_MAILTO }), { retries: 2, baseDelay: 800 });
  return data ? mapOpenAlex(data).slice(0, max).map(slimRef) : [];
}
