import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAtom, buildUrl, arxivQuery } from '../lib/sources/arxiv.mjs';

const xml = readFileSync(new URL('../fixtures/arxiv.sample.xml', import.meta.url), 'utf8');

test('arxivQuery ANDs significant terms and drops stopwords', () => {
  assert.equal(arxivQuery('vision language model'), 'all:vision AND all:language AND all:model');
  assert.equal(arxivQuery('the future of AI'), 'all:future AND all:ai');
  assert.equal(arxivQuery('transformers'), 'all:transformers');
});

test('buildUrl encodes ANDed query + recency sort', () => {
  const u = buildUrl('vision language', { max: 5 });
  assert.match(u, /search_query=all%3Avision/);
  assert.match(u, /all%3Alanguage/);
  assert.match(u, /AND/);
  assert.match(u, /sortBy=submittedDate/);
  assert.match(u, /max_results=5/);
  assert.match(u, /^https:/);
});

test('buildUrl applies a submittedDate window when since/until are given', () => {
  const u = buildUrl('vision language', { max: 5, since: '2024-12-01', until: '2026-06-04' });
  assert.match(u, /submittedDate%3A%5B202412010000%20TO%20202606042359%5D/);
  assert.match(u, /\(all%3Avision%20AND%20all%3Alanguage\)/); // term clause stays parenthesised
});

test('buildUrl omits the date window when neither bound is given', () => {
  assert.ok(!/submittedDate%3A/.test(buildUrl('vision language', { max: 5 })));
});

test('parseAtom yields normalized papers', () => {
  const papers = parseAtom(xml);
  assert.equal(papers.length, 2);
  const p = papers[0];
  assert.equal(p.title, 'Scaling Vision-Language Pretraining with Synthetic Captions');
  assert.deepEqual(p.authors, ['Jane Doe', 'John Smith']);
  assert.equal(p.arxivId, '2401.01234');
  assert.equal(p.sources[0], 'arxiv');
  assert.equal(p.links.arxiv, 'https://arxiv.org/abs/2401.01234');
  assert.equal(p.links.pdf, 'http://arxiv.org/pdf/2401.01234v1');
  assert.match(p.publishedDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(p.fields, ['cs.CV', 'cs.LG']);
});

test('parseAtom finds pdf link regardless of attribute order', () => {
  // second entry has href before title="pdf"
  const p = parseAtom(xml)[1];
  assert.equal(p.links.pdf, 'http://arxiv.org/pdf/2402.05678v2');
  assert.equal(p.arxivId, '2402.05678');
});

test('parseAtom decodes HTML entities in title/abstract', () => {
  const xmlEnt = '<feed><entry><id>http://arxiv.org/abs/2401.99999v1</id>' +
    '<published>2026-01-01T00:00:00Z</published>' +
    '<title>Speed &amp; Scale: O&#39;Brien&#39;s &lt;Method&gt;</title>' +
    '<summary>a &amp; b</summary><author><name>X</name></author></entry></feed>';
  const p = parseAtom(xmlEnt)[0];
  assert.equal(p.title, "Speed & Scale: O'Brien's <Method>");
  assert.equal(p.abstract, 'a & b');
});

test('parseAtom handles empty input', () => {
  assert.deepEqual(parseAtom(''), []);
  assert.deepEqual(parseAtom(null), []);
});
