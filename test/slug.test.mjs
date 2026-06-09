import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, normalizeTitle } from '../lib/slug.mjs';

test('slugify lowercases, trims, hyphenates', () => {
  assert.equal(slugify('  Vision-Language  Models! '), 'vision-language-models');
});
test('slugify collapses non-alphanumerics', () => {
  assert.equal(slugify('LLM/RLHF @ scale'), 'llm-rlhf-scale');
});
test('normalizeTitle strips punctuation+spaces for matching', () => {
  assert.equal(normalizeTitle('Attention Is All You Need.'), 'attentionisallyouneed');
  assert.equal(normalizeTitle('Attention  is all  you need'), 'attentionisallyouneed');
});
