import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('fetch.mjs produces a valid raw.json (network)', { timeout: 90000 }, () => {
  if (process.env.PAPER_BOY_SKIP_NET) return;
  const out = '/tmp/pb-smoke/raw.json';
  execFileSync('node', ['bin/fetch.mjs', '--query', 'vision language models',
    '--since', '2024-01-01', '--max', '12', '--out', out], { cwd: ROOT });
  const data = JSON.parse(readFileSync(out, 'utf8'));
  assert.ok(data.papers.length >= 1, 'at least one paper across sources');
  assert.ok(data.papers[0].title, 'paper has a title');
  assert.ok(data.meta.slug === 'vision-language-models');
  const dois = data.papers.map((p) => p.doi).filter(Boolean);
  assert.equal(dois.length, new Set(dois).size, 'no duplicate DOIs');
  const arxiv = data.papers.map((p) => p.arxivId).filter(Boolean);
  assert.equal(arxiv.length, new Set(arxiv).size, 'no duplicate arXiv ids');
  rmSync('/tmp/pb-smoke', { recursive: true, force: true });
});
