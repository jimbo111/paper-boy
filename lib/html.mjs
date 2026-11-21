import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toBibtex } from './bibtex.mjs';
import { toRis } from './ris.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(HERE, '../template/fonts');

// Typeface: PB Latin Modern Roman, a Latin subset of Latin Modern Roman 10 (GUST
// Font License; see template/fonts/README-fonts.txt). Inlined as base64 so every
// rendered report stays a SINGLE self-contained, offline file with zero external
// font requests. One static file per style.
const FACES = [
  ['normal', 400, 'pb-lmroman-regular.latin.woff2'],
  ['italic', 400, 'pb-lmroman-italic.latin.woff2'],
  ['normal', 700, 'pb-lmroman-bold.latin.woff2'],
  ['italic', 700, 'pb-lmroman-bolditalic.latin.woff2'],
];
function fontFaces() {
  const b64 = (f) => readFileSync(join(FONT_DIR, f)).toString('base64');
  return FACES.map(([style, weight, file]) =>
    `@font-face{font-family:'PB Latin Modern Roman';font-style:${style};font-weight:${weight};` +
    `font-display:swap;src:url(data:font/woff2;base64,${b64(file)}) format('woff2');}`).join('');
}

// Escape < and > so a stray "</script>" inside embedded data can't break out of
// its <script> block. JSON's < / > are reversed by JSON.parse on the
// client, so the payload round-trips exactly.
const neutralize = (s) => s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

export function renderHtml(enriched, template, markdown = '') {
  const usedKeys = new Set(); // citekeys must be unique across the whole export
  const withBib = {
    ...enriched,
    papers: (enriched.papers || []).map((p) => ({ ...p, bibtex: toBibtex(p, usedKeys), ris: toRis(p) })),
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
