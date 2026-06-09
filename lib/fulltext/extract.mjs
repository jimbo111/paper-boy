import { getText } from '../http.mjs';

// Default cap on full-text length handed to the model (chars). Keeps token cost and
// context size bounded; the model is told the text is truncated.
export const DEFAULT_TEXT_CAP = 60000;

export const ar5ivUrl = (arxivId) => `https://ar5iv.org/abs/${arxivId}`;
export const arxivHtmlUrl = (arxivId) => `https://arxiv.org/html/${arxivId}`;

// Dependency-free HTML → text. Drops script/style, strips tags, decodes the common
// entities (mirrors arxiv.mjs' decoder), and collapses whitespace. Not a full DOM
// parser — good enough to feed an LLM the prose of a paper.
export function stripHtmlToText(html) {
  if (!html) return '';
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|h[1-6]|li|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
  return s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// Fetch structured-enough full text for one paper. Tiered, zero-dependency ladder:
//   1. ar5iv HTML render      2. arXiv native HTML      3. abstract-only fallback
// Returns { text, source } where source ∈ {ar5iv, arxiv-html, abstract}. `getImpl`
// and `log` are injected for tests.
export async function fetchFullText(paper, { getImpl = getText, cap = DEFAULT_TEXT_CAP, log = () => {} } = {}) {
  const id = paper && paper.arxivId;
  const fallback = () => {
    log(`full-text unavailable for ${paper && paper.id} — using abstract only`);
    return { text: (paper && paper.abstract) || '', source: 'abstract' };
  };

  if (id) {
    for (const [source, url] of [['ar5iv', ar5ivUrl(id)], ['arxiv-html', arxivHtmlUrl(id)]]) {
      const html = await getImpl(url, { retries: 2, timeout: 20000 });
      const text = stripHtmlToText(html);
      // ar5iv/arXiv return a small stub page on miss; require real body length.
      if (text && text.length > 500) return { text: cap > 0 ? text.slice(0, cap) : text, source };
    }
  }
  return fallback();
}
