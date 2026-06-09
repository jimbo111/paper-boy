import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapS2, buildUrl } from '../lib/sources/semanticscholar.mjs';

const data = JSON.parse(readFileSync(new URL('../fixtures/s2.sample.json', import.meta.url)));

test('buildUrl includes fields and year filter', () => {
  const u = buildUrl('vision language', { max: 10, since: '2024-01-01' });
  assert.match(u, /paper\/search\?query=vision%20language/);
  assert.match(u, /limit=10/);
  assert.match(u, /fields=title,abstract/);
  assert.match(u, /year=2024-/);
});

test('buildUrl clamps limit to the S2 max of 100', () => {
  assert.match(buildUrl('x', { max: 500 }), /limit=100&/);
  assert.match(buildUrl('x', { max: 40 }), /limit=40&/);
});

test('mapS2 normalizes records', () => {
  const papers = mapS2(data);
  assert.ok(papers.length >= 2);
  const p = papers[0];
  assert.equal(p.sources[0], 's2');
  assert.equal(typeof p.citationCount, 'number');
  assert.equal(p.tldr, 'A short, model-generated summary of the paper.');
  assert.equal(p.doi, '10.1234/abc');
  assert.equal(p.arxivId, '2401.01234');
  assert.equal(p.id, 'doi:10.1234/abc');
  assert.deepEqual(p.authors, ['Jane Doe', 'John Smith']);
  assert.equal(p.links.pdf, 'https://example.org/paper.pdf');
});

test('mapS2 tolerates missing optional fields', () => {
  const papers = mapS2(data);
  const p = papers[1];
  assert.equal(p.tldr, null);
  assert.equal(p.doi, null);
  assert.equal(p.id, 'arxiv:2402.05678');
});

test('mapS2 handles empty data', () => {
  assert.deepEqual(mapS2(null), []);
  assert.deepEqual(mapS2({ data: [] }), []);
});
