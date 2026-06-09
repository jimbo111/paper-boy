import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeMerge } from '../lib/dedup.mjs';

const mk = (over) => ({
  id: 'x', title: 'Attention Is All You Need', authors: ['A'], abstract: null, tldr: null,
  publishedDate: '2026-01-01', year: 2026, venue: null, citationCount: 0,
  influentialCitationCount: null, fields: [], sources: ['arxiv'], arxivId: null, doi: null,
  links: { pdf: null, arxiv: null, doi: null, landing: null }, ...over,
});

test('merges by DOI and unions sources + max citations + best abstract', () => {
  const a = mk({ doi: '10.1/x', sources: ['s2'], citationCount: 100, abstract: null, tldr: 'short' });
  const b = mk({ doi: '10.1/X', sources: ['openalex'], citationCount: 250, abstract: 'long abstract here' });
  const out = dedupeMerge([a, b]);
  assert.equal(out.length, 1);
  assert.deepEqual([...out[0].sources].sort(), ['openalex', 's2']);
  assert.equal(out[0].citationCount, 250);
  assert.equal(out[0].abstract, 'long abstract here');
  assert.equal(out[0].tldr, 'short');
});

test('merges by normalized title when no DOI/arxiv', () => {
  const a = mk({ title: 'Attention is all you need.', sources: ['arxiv'] });
  const b = mk({ title: 'Attention Is All You Need', sources: ['openalex'] });
  assert.equal(dedupeMerge([a, b]).length, 1);
});

test('merges transitively: arxiv-id link then title link', () => {
  const a = mk({ arxivId: '2401.1', title: 'A', sources: ['arxiv'] });
  const b = mk({ arxivId: '2401.1', title: 'A revised', sources: ['s2'] });
  const c = mk({ title: 'A revised', sources: ['openalex'] });
  const out = dedupeMerge([a, b, c]);
  assert.equal(out.length, 1);
  assert.deepEqual([...out[0].sources].sort(), ['arxiv', 'openalex', 's2']);
});

test('a bridge record unifies two already-separate entries', () => {
  const a = mk({ doi: '10.1/a', title: 'Paper A', sources: ['s2'] });
  const b = mk({ arxivId: '2401.1', title: 'Totally different title', sources: ['openalex'] });
  const c = mk({ doi: '10.1/a', arxivId: '2401.1', title: 'Paper A', sources: ['arxiv'] }); // bridges a & b
  const out = dedupeMerge([a, b, c]);
  assert.equal(out.length, 1);
  assert.deepEqual([...out[0].sources].sort(), ['arxiv', 'openalex', 's2']);
});

test('keeps distinct papers separate', () => {
  assert.equal(dedupeMerge([mk({ doi: '10.1/a' }), mk({ doi: '10.1/b', title: 'Other' })]).length, 2);
});
