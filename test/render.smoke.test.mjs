import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Pull the markdown back out of the embedded report-md block (JSON-string encoded,
// with < / > neutralised) — mirrors what the in-browser Export menu does.
function embeddedReport(html) {
  const m = html.match(/<script id="report-md" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'report-md block exists');
  return JSON.parse(m[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>'));
}

test('render.mjs writes only a self-contained index.html (no report.md on disk)', () => {
  const dir = '/tmp/pb-render-test';
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  copyFileSync(`${ROOT}/fixtures/papers.enriched.sample.json`, `${dir}/papers.enriched.json`);

  execFileSync('node', ['bin/render.mjs', '--in', `${dir}/papers.enriched.json`, '--no-open'], { cwd: ROOT });

  assert.ok(existsSync(`${dir}/index.html`), 'index.html exists');
  assert.ok(!existsSync(`${dir}/report.md`), 'report.md is NOT written to disk anymore');
  assert.ok(existsSync(`${dir}/papers.enriched.json`), 'enriched JSON audit file untouched');

  const html = readFileSync(`${dir}/index.html`, 'utf8');
  assert.ok(html.includes('Efficient LoRA Fine-Tuning for Multimodal Models'), 'paper title embedded');
  assert.ok(!html.includes('__PAPER_BOY_DATA__'), 'data token replaced');
  assert.ok(!html.includes('__PAPER_BOY_REPORT_MD__'), 'report token replaced');

  // The Markdown report is embedded and recoverable (the .md download source).
  const md = embeddedReport(html);
  assert.match(md, /# 📰 paper-boy/);
  assert.ok(md.includes('Efficient LoRA Fine-Tuning for Multimodal Models'), 'report carries the paper');
  assert.ok(md.includes('confines low-rank adapters to the cross-attention layers'), 'per-paper summary is in the report');

  // Export menu wiring is present.
  assert.ok(html.includes('id="exportMenu"'), 'export menu present');
  assert.ok(html.includes('data-dl="md"') && html.includes('data-dl="json"') && html.includes('data-dl="bib"'), 'all three download actions present');

  rmSync(dir, { recursive: true, force: true });
});
