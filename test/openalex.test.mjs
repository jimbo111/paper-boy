import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapOpenAlex, reconstructAbstract, buildUrl } from '../lib/sources/openalex.mjs';

const data = JSON.parse(readFileSync(new URL('../fixtures/openalex.sample.json', import.meta.url)));

test('reconstructAbstract rebuilds word order from inverted index', () => {
  const inv = { Hello: [0], world: [1], again: [2, 4], hello: [3] };
  assert.equal(reconstructAbstract(inv), 'Hello world again hello again');
});

test('reconstructAbstract handles null', () => {
  assert.equal(reconstructAbstract(null), null);
});

test('buildUrl uses per-page, recency sort, a bounded date window, and an optional contact', () => {
  const u = buildUrl('vision language', { max: 25, since: '2024-12-01', until: '2026-06-04', mailto: 'a@b.io' });
  assert.match(u, /per-page=25/);
  assert.match(u, /sort=publication_date:desc/);
  assert.match(u, /filter=from_publication_date:2024-12-01,to_publication_date:2026-06-04/);
  assert.match(u, /mailto=a%40b\.io/);
});

test('buildUrl omits mailto when no contact is provided (no hardcoded email)', () => {
  assert.ok(!/mailto=/.test(buildUrl('x', { max: 5 })), 'contact email is opt-in, not baked in');
});

test('buildUrl clamps per-page to the OpenAlex max of 200', () => {
  assert.match(buildUrl('x', { max: 500 }), /per-page=200(&|$)/);
  assert.match(buildUrl('x', { max: 40 }), /per-page=40(&|$)/);
});

test('mapOpenAlex normalizes live sample records', () => {
  const papers = mapOpenAlex(data);
  assert.ok(papers.length >= 1);
  const p = papers[0];
  assert.equal(p.sources[0], 'openalex');
  assert.equal(typeof p.citationCount, 'number');
  assert.ok(typeof p.title === 'string' && p.title.length > 0);
  assert.ok(Array.isArray(p.authors));
});

test('mapOpenAlex handles empty data', () => {
  assert.deepEqual(mapOpenAlex(null), []);
});
