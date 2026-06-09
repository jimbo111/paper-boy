import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripHtmlToText, fetchFullText, ar5ivUrl } from '../lib/fulltext/extract.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ar5iv = readFileSync(`${ROOT}/fixtures/ar5iv.sample.html`, 'utf8');
const stub = readFileSync(`${ROOT}/fixtures/arxiv-html.sample.html`, 'utf8');

test('stripHtmlToText removes script/style and tags, decodes entities', () => {
  const t = stripHtmlToText('<style>a{}</style><p>Hello &amp; bye &#39;x&#39;</p><script>1</script>');
  assert.ok(!t.includes('{'));
  assert.ok(!t.includes('<'));
  assert.match(t, /Hello & bye 'x'/);
});

test('fetchFullText uses ar5iv when it returns a real body', async () => {
  const getImpl = async (url) => (url === ar5ivUrl('2402.05678') ? ar5iv : stub);
  const { text, source } = await fetchFullText({ arxivId: '2402.05678', abstract: 'abs' }, { getImpl });
  assert.equal(source, 'ar5iv');
  assert.match(text, /low-rank adaptation/);
});

test('fetchFullText falls back to arxiv-html, then abstract', async () => {
  // ar5iv returns the tiny stub (<500 chars) → try arxiv-html (also stub) → abstract.
  const getImpl = async () => stub;
  const logs = [];
  const { text, source } = await fetchFullText(
    { arxivId: '9999.99999', abstract: 'the real abstract' },
    { getImpl, log: (m) => logs.push(m) },
  );
  assert.equal(source, 'abstract');
  assert.equal(text, 'the real abstract');
  assert.ok(logs.some((l) => /abstract only/.test(l)));
});

test('no arxivId goes straight to abstract', async () => {
  let called = false;
  const { source } = await fetchFullText(
    { abstract: 'x' },
    { getImpl: async () => { called = true; return ''; } },
  );
  assert.equal(source, 'abstract');
  assert.equal(called, false);
});

test('full text is capped to the char budget', async () => {
  const big = '<p>' + 'word '.repeat(50000) + '</p>';
  const { text } = await fetchFullText({ arxivId: '1', abstract: '' }, { getImpl: async () => big, cap: 1000 });
  assert.ok(text.length <= 1000);
});
