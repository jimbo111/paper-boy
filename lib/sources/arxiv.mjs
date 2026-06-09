import { getText } from '../http.mjs';

const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'and', 'or',
  'vs', 'with', 'using', 'via', 'at', 'by', 'as']);

// AND the significant terms so a multi-word topic matches papers about ALL of them,
// not any one — loose `all:` + date-sort otherwise floods with recent-but-irrelevant hits.
export function arxivQuery(query) {
  const terms = String(query).toLowerCase().split(/\s+/).filter((t) => t && !STOP.has(t));
  if (!terms.length) return `all:${String(query).trim()}`;
  return terms.map((t) => `all:${t}`).join(' AND ');
}

// arXiv encodes a submitted-date window directly in the query as
// submittedDate:[YYYYMMDDHHMM TO YYYYMMDDHHMM]. We AND it onto the term clause so the
// since/until window is actually enforced — not just approximated by recency sort.
const stamp = (d, endOfDay) => {
  const digits = String(d || '').slice(0, 10).replace(/-/g, '');
  return digits.length === 8 ? digits + (endOfDay ? '2359' : '0000') : null;
};
export function buildUrl(query, { max = 40, since, until } = {}) {
  let sq = arxivQuery(query);
  const lo = stamp(since, false);
  const hi = stamp(until, true);
  if (lo || hi) sq = `(${sq}) AND submittedDate:[${lo || '199101010000'} TO ${hi || '299912312359'}]`;
  return `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(sq)}` +
         `&start=0&max_results=${max}&sortBy=submittedDate&sortOrder=descending`;
}

// Atom XML escapes text (&amp;, &lt;, &#39;, …); decode it so titles/abstracts read cleanly.
// &amp; is decoded LAST to avoid turning "&amp;lt;" into "<".
function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decodeEntities(m[1].trim().replace(/\s+/g, ' ')) : null;
};

export function parseAtom(xml) {
  if (!xml) return [];
  const entries = xml.split('<entry>').slice(1).map((s) => s.split('</entry>')[0]);
  return entries.map((e) => {
    const idUrl = tag(e, 'id') || '';
    const arxivId = (idUrl.match(/abs\/([^v\s]+)(v\d+)?/) || [])[1] || null;
    const authors = [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => m[1].trim());
    const cats = [...e.matchAll(/<category[^>]*term="([^"]+)"/g)].map((m) => m[1]);
    const published = (tag(e, 'published') || '').slice(0, 10) || null;
    // attribute order varies, so find the <link> tag tagged as pdf, then read its href
    const pdfTag = [...e.matchAll(/<link\b[^>]*\/?>/g)].map((m) => m[0]).find((t) => /title="pdf"/.test(t));
    const pdf = pdfTag ? (pdfTag.match(/href="([^"]+)"/) || [])[1] || null : null;
    return {
      id: arxivId ? `arxiv:${arxivId}` : idUrl,
      title: tag(e, 'title'),
      authors,
      abstract: tag(e, 'summary'),
      tldr: null,
      publishedDate: published,
      year: published ? +published.slice(0, 4) : null,
      venue: 'arXiv',
      citationCount: 0,
      influentialCitationCount: null,
      fields: cats,
      sources: ['arxiv'],
      arxivId,
      doi: null,
      links: {
        pdf,
        arxiv: arxivId ? `https://arxiv.org/abs/${arxivId}` : idUrl,
        doi: null,
        landing: null,
      },
    };
  });
}

export async function fetchArxiv(query, opts) {
  const xml = await getText(buildUrl(query, opts), { retries: 4, baseDelay: 1500 });
  return parseAtom(xml);
}
