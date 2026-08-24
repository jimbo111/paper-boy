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

test('does not merge distinct untitled papers on the empty-title key', () => {
  const a = mk({ id: 's2:a', title: null, sources: ['s2'] });
  const b = mk({ id: 's2:b', title: null, sources: ['openalex'] });
  assert.equal(dedupeMerge([a, b]).length, 2);
});

test('absorbed entries leave no stale keys behind (alternate-title resurrection)', () => {
  // "Baz" merges into the DOI cluster via entry b; when a bridge record later absorbs
  // that cluster, the "Baz" title key must follow it — a fifth record titled "Baz"
  // must land in the merged entry, not resurrect as a duplicate.
  const a = mk({ id: '1', title: 'Foo', arxivId: 'X' });
  const b = mk({ id: '2', title: 'Bar', doi: '10.1/d' });
  const c = mk({ id: '3', title: 'Baz', doi: '10.1/d' });
  const d = mk({ id: '4', title: 'Quux', arxivId: 'X', doi: '10.1/d' }); // bridges a and b/c
  const e = mk({ id: '5', title: 'Baz' });
  const out = dedupeMerge([a, b, c, d, e]);
  assert.equal(out.length, 1);
});

test('same title but incompatible years stays two papers', () => {
  const a = mk({ id: '1', title: 'Editorial', year: 2019, publishedDate: '2019-03-01' });
  const b = mk({ id: '2', title: 'Editorial', year: 2026, publishedDate: '2026-02-01' });
  assert.equal(dedupeMerge([a, b]).length, 2);
});

test('same title with a missing or adjacent year still merges', () => {
  const a = mk({ id: '1', title: 'Same Study', year: 2025, sources: ['arxiv'] });
  const b = mk({ id: '2', title: 'Same Study', year: null, sources: ['s2'] });
  const c = mk({ id: '3', title: 'Same Study', year: 2026, sources: ['openalex'] });
  assert.equal(dedupeMerge([a, b, c]).length, 1);
});
