import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderMarkdown } from '../lib/markdown.mjs';

const data = JSON.parse(readFileSync(new URL('../fixtures/papers.enriched.sample.json', import.meta.url)));

test('renderMarkdown emits all required sections', () => {
  const md = renderMarkdown(data);
  assert.match(md, /^# 📰 paper-boy: vision language model fine-tuning/m);
  assert.match(md, /## What's trending/);
  assert.match(md, /## Start here/);
  assert.match(md, /## Sources/);
});

test('every paper title appears', () => {
  const md = renderMarkdown(data);
  for (const p of data.papers) assert.ok(md.includes(p.title), `missing: ${p.title}`);
});

test('must-reads are starred and deep-dive findings render', () => {
  const md = renderMarkdown(data);
  assert.match(md, /⭐/);
  assert.match(md, /\*\*Key findings:\*\*/);
  assert.match(md, /6x fewer trainable params/);
});

test('handles empty result set without throwing', () => {
  const md = renderMarkdown({ meta: { topic: 'x', sources: {} }, clusters: [], startHere: [], papers: [] });
  assert.match(md, /# 📰 paper-boy: x/);
  assert.match(md, /## Sources/);
});
