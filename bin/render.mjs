#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../lib/markdown.mjs';
import { renderHtml } from '../lib/html.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = { open: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') o.in = argv[++i];
    else if (a === '--no-open') o.open = false;
  }
  return o;
}

const o = parseArgs(process.argv.slice(2));
if (!o.in) { console.error('paper-boy render: --in <papers.enriched.json> is required'); process.exit(2); }

const enriched = JSON.parse(readFileSync(o.in, 'utf8'));
const dir = dirname(o.in);
const tpl = readFileSync(join(HERE, '../template/reader.html'), 'utf8');

const htmlPath = join(dir, 'index.html');
// The Markdown report is no longer written to disk — it is embedded in the HTML
// and offered as a download from the in-browser Export menu. papers.raw.json and
// papers.enriched.json remain on disk as the audit trail.
const markdown = renderMarkdown(enriched);
writeFileSync(htmlPath, renderHtml(enriched, tpl, markdown));
console.error(`paper-boy: wrote ${htmlPath}`);

if (o.open) execFile('open', [htmlPath], () => {}); // macOS; silent no-op on failure
