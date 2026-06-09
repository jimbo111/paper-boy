import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRis, risFor } from '../lib/ris.mjs';

const paper = {
  title: 'Efficient LoRA Fine-Tuning for Multimodal Models',
  authors: ['Jane Roe', 'John Doe'],
  year: 2024,
  publishedDate: '2024-02-10',
  venue: 'Journal of ML',
  doi: '10.1234/abc',
  abstract: 'Line one.\nLine two with a break.',
  fields: ['cs.CV'],
  links: { doi: 'https://doi.org/10.1234/abc', arxiv: 'https://arxiv.org/abs/2402.05678' },
};

test('toRis emits a well-formed record with the core tags', () => {
  const ris = toRis(paper);
  assert.match(ris, /^TY {2}- JOUR/m);
  assert.match(ris, /^TI {2}- Efficient LoRA/m);
  assert.match(ris, /^AU {2}- Jane Roe$/m);
  assert.match(ris, /^AU {2}- John Doe$/m);
  assert.match(ris, /^PY {2}- 2024$/m);
  assert.match(ris, /^DO {2}- 10\.1234\/abc$/m);
  assert.match(ris, /^UR {2}- https:\/\/doi\.org\/10\.1234\/abc$/m);
  assert.match(ris, /^ER {2}- $/m);
});

test('newlines in values are flattened so they cannot corrupt the record', () => {
  const ris = toRis(paper);
  const abLine = ris.split('\n').find((l) => l.startsWith('AB  - '));
  assert.ok(abLine && !abLine.includes('\n'));
  assert.match(abLine, /Line one\. Line two/);
});

test('conference venues map to CONF', () => {
  assert.match(toRis({ ...paper, venue: 'NeurIPS Workshop' }), /^TY {2}- CONF/m);
});

test('handles missing fields without throwing', () => {
  const ris = toRis({ title: 'X' });
  assert.match(ris, /^TY {2}- JOUR/m);
  assert.match(ris, /^TI {2}- X/m);
  assert.match(ris, /^ER {2}- $/m);
});

test('risFor joins multiple records separated by blank lines', () => {
  const out = risFor([paper, { title: 'Second' }]);
  assert.equal(out.match(/^TY {2}- /gm).length, 2);
  assert.ok(out.endsWith('\n'));
});
