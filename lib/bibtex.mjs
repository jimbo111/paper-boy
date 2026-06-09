// Escape BibTeX-special characters in field values so the .bib stays valid.
function bibEsc(s) {
  return String(s == null ? '' : s).replace(/([&%$#_{}])/g, '\\$1');
}

// Surname for the citekey. Sources emit "First Last" (arXiv, OpenAlex, S2) — take the
// last token; only fall back to the pre-comma part when a "Last, First" comma form is used.
function surnameOf(author) {
  const raw = author || 'anon';
  const s = raw.includes(',') ? raw.split(',')[0] : raw.trim().split(/\s+/).pop();
  return (s || 'anon').toLowerCase().replace(/[^a-z]/g, '') || 'anon';
}

export function toBibtex(p) {
  const first = surnameOf(p.authors?.[0]);
  const word = (p.title || 'untitled').toLowerCase().match(/[a-z]+/)?.[0] || 'untitled';
  const key = `${first}${p.year || 'nd'}${word}`;
  const lines = [
    `  title={${bibEsc(p.title)}}`,
    `  author={${(p.authors || []).map(bibEsc).join(' and ')}}`,
    p.year ? `  year={${p.year}}` : null,
    p.venue ? `  journal={${bibEsc(p.venue)}}` : null,
    p.doi ? `  doi={${p.doi}}` : null,
    p.arxivId ? `  eprint={${p.arxivId}}` : null,
  ].filter(Boolean);
  return `@article{${key},\n${lines.join(',\n')}\n}`;
}
