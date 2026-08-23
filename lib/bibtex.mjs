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

// Pass a shared Set as `usedKeys` when generating a whole .bib: distinct papers
// routinely collide on surname+year+first-word (chen2026efficient …), and duplicate
// citekeys make BibTeX importers drop records. The first taker keeps the bare key;
// later colliders get a b/c/… suffix, per the usual convention.
export function toBibtex(p, usedKeys) {
  const first = surnameOf(p.authors?.[0]);
  const word = (p.title || 'untitled').toLowerCase().match(/[a-z]+/)?.[0] || 'untitled';
  let key = `${first}${p.year || 'nd'}${word}`;
  if (usedKeys) {
    if (usedKeys.has(key)) {
      let n = 1;
      const suffix = (i) => (i <= 25 ? String.fromCharCode(97 + i) : `x${i}`);
      while (usedKeys.has(key + suffix(n))) n++;
      key += suffix(n);
    }
    usedKeys.add(key);
  }
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
