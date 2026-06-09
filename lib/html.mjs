import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toBibtex } from './bibtex.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(HERE, '../template/fonts');

// Editorial typeface: Newsreader (SIL OFL 1.1 — see template/fonts/OFL.txt).
// Inlined as base64 so every rendered report stays a SINGLE self-contained, offline
// file with zero external font requests. Latin subset; one variable file per style
// carries the whole 400–700 weight range plus optical sizing.
function fontFaces() {
  const b64 = (f) => readFileSync(join(FONT_DIR, f)).toString('base64');
  const face = (style, file) =>
    `@font-face{font-family:'Newsreader';font-style:${style};font-weight:400 700;` +
    `font-display:swap;src:url(data:font/woff2;base64,${b64(file)}) format('woff2');}`;
  return face('normal', 'newsreader-roman.latin.woff2') +
         face('italic', 'newsreader-italic.latin.woff2');
}

// Escape < and > so a stray "</script>" inside embedded data can't break out of
// its <script> block. JSON's < / > are reversed by JSON.parse on the
// client, so the payload round-trips exactly.
const neutralize = (s) => s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

export function renderHtml(enriched, template, markdown = '') {
  const withBib = {
    ...enriched,
    papers: (enriched.papers || []).map((p) => ({ ...p, bibtex: toBibtex(p) })),
  };
  const data = neutralize(JSON.stringify(withBib));
  // The report is embedded as a JSON-encoded string so the exact same escaping
  // protects it; the client JSON.parses it back to the original markdown.
  const report = neutralize(JSON.stringify(String(markdown ?? '')));
  // Function replacers avoid `$&`/`$1` special handling if the data contains `$`.
  return template
    .replace('__PAPER_BOY_FONTS__', () => fontFaces())
    .replace('__PAPER_BOY_REPORT_MD__', () => report)
    .replace('__PAPER_BOY_DATA__', () => data);
}
