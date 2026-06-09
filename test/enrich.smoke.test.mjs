import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// End-to-end with the offline fake LLM: raw fixture → enrich.mjs → enriched JSON
// that render.mjs accepts. No network, no API key.
test('enrich.mjs (fake LLM) emits enriched JSON that render.mjs consumes', () => {
  const dir = '/tmp/pb-enrich-test';
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  copyFileSync(`${ROOT}/fixtures/papers.raw.sample.json`, `${dir}/papers.raw.json`);

  execFileSync('node', ['bin/enrich.mjs', '--in', `${dir}/papers.raw.json`, '--out', `${dir}/papers.enriched.json`],
    { cwd: ROOT, env: { ...process.env, PAPER_BOY_FAKE_LLM: '1' } });

  assert.ok(existsSync(`${dir}/papers.enriched.json`), 'enriched JSON written');
  const e = JSON.parse(readFileSync(`${dir}/papers.enriched.json`, 'utf8'));
  assert.deepEqual(Object.keys(e).sort(), ['clusters', 'meta', 'papers', 'startHere', 'trending'].sort());
  assert.ok(e.papers.length > 0 && e.clusters.length > 0);
  assert.ok(e.papers.every((p) => typeof p.relevance === 'number' && 'deepDive' in p));

  // render.mjs accepts it and writes a self-contained reader.
  execFileSync('node', ['bin/render.mjs', '--in', `${dir}/papers.enriched.json`, '--no-open'], { cwd: ROOT });
  assert.ok(existsSync(`${dir}/index.html`), 'render produced index.html');

  rmSync(dir, { recursive: true, force: true });
});
