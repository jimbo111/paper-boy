// RIS citation format — the interchange format Zotero, Mendeley, EndNote, and
// RefWorks import natively. One record per paper; deterministic, no dependencies.

// RIS is line-oriented ("XY  - value"); strip newlines from values so a multi-line
// abstract can't corrupt the record structure.
const clean = (s) => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim();

// Best public link for the UR tag, preferring a DOI.
function bestUrl(p) {
  const l = p.links || {};
  return l.doi || l.arxiv || l.landing || l.pdf || (p.doi ? `https://doi.org/${p.doi}` : '') || '';
}

export function toRis(p) {
  // Conference papers vs journal/preprint — RIS has no "preprint" type, JOUR is the
  // conventional fallback arXiv/OpenAlex exporters use.
  const ty = /conf|proc|symposium|workshop/i.test(p.venue || '') ? 'CONF' : 'JOUR';
  const lines = [`TY  - ${ty}`];
  lines.push(`TI  - ${clean(p.title) || 'Untitled'}`);
  for (const a of p.authors || []) { const v = clean(a); if (v) lines.push(`AU  - ${v}`); }
  if (p.year) lines.push(`PY  - ${p.year}`);
  if (p.publishedDate) lines.push(`DA  - ${clean(p.publishedDate)}`);
  if (p.venue) lines.push(`JO  - ${clean(p.venue)}`);
  if (p.doi) lines.push(`DO  - ${clean(p.doi)}`);
  const url = bestUrl(p);
  if (url) lines.push(`UR  - ${clean(url)}`);
  if (p.abstract) lines.push(`AB  - ${clean(p.abstract)}`);
  for (const f of p.fields || []) { const v = clean(f); if (v) lines.push(`KW  - ${v}`); }
  lines.push('ER  - ');
  return lines.join('\n');
}

export function risFor(papers) {
  return (papers || []).map(toRis).join('\n\n') + '\n';
}
