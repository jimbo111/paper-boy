import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workLookupUrl, refsBatchUrl, fetchRelated } from '../lib/sources/openalex.mjs';

test('workLookupUrl resolves by DOI, then openalex id, then arxiv id', () => {
  assert.match(workLookupUrl({ doi: '10.1/x' }), /works\/https:\/\/doi\.org\/10\.1\/x\?select=id,referenced_works/);
  assert.match(workLookupUrl({ id: 'openalex:W123' }), /works\/W123\?/);
  assert.match(workLookupUrl({ arxivId: '2402.05678' }), /works\/arxiv:2402\.05678\?/);
  assert.equal(workLookupUrl({ id: 'arxiv:x' }), null); // no doi/openalex/arxivId fields
});

test('refsBatchUrl pipe-joins bare ids, caps at 50, sorts by citations', () => {
  const ids = Array.from({ length: 60 }, (_, i) => `https://openalex.org/W${i}`);
  const url = refsBatchUrl(ids, { max: 5 });
  assert.match(url, /filter=openalex_id:W0\|W1\|/);
  assert.equal(url.split('|').length, 50, 'caps the filter list at 50');
  assert.match(url, /sort=cited_by_count:desc/);
  assert.match(url, /per-page=5/);
});

test('fetchRelated walks the graph and returns slim, capped, real refs', async () => {
  const calls = [];
  const getImpl = async (url) => {
    calls.push(url);
    if (/select=id,referenced_works/.test(url)) {
      return { id: 'https://openalex.org/W1', referenced_works: ['https://openalex.org/W10', 'https://openalex.org/W11'] };
    }
    return {
      results: [
        { id: 'https://openalex.org/W10', display_name: 'Ref A', publication_year: 2020, cited_by_count: 99,
          authorships: [{ author: { display_name: 'A. Author' } }], ids: {}, doi: 'https://doi.org/10.5/a' },
        { id: 'https://openalex.org/W11', display_name: 'Ref B', publication_year: 2019, cited_by_count: 50, authorships: [] },
      ],
    };
  };
  const out = await fetchRelated({ doi: '10.1/x' }, { max: 1, getImpl });
  assert.equal(calls.length, 2, 'one lookup + one batch fetch');
  assert.equal(out.length, 1, 'capped to max');
  assert.equal(out[0].title, 'Ref A');
  assert.equal(out[0].doi, '10.5/a');
  assert.equal(out[0].link, 'https://doi.org/10.5/a');
  // slim shape only — no abstract/tldr carried through
  assert.deepEqual(Object.keys(out[0]).sort(), ['authors', 'citationCount', 'doi', 'id', 'link', 'title', 'venue', 'year'].sort());
});

test('fetchRelated returns [] when the paper cannot be resolved or has no refs', async () => {
  assert.deepEqual(await fetchRelated({ id: 'arxiv:nope' }, { getImpl: async () => ({}) }), []);
  assert.deepEqual(await fetchRelated({ doi: '10.1/x' }, { getImpl: async () => ({ referenced_works: [] }) }), []);
});
