import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getJSON } from '../lib/http.mjs';

test('retries on 429 then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls < 3) return { ok: false, status: 429, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ hi: 1 }) };
  };
  const out = await getJSON('http://x', { retries: 3, baseDelay: 0, fetchImpl });
  assert.deepEqual(out, { hi: 1 });
  assert.equal(calls, 3);
});

test('returns null after exhausting retries', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const out = await getJSON('http://x', { retries: 2, baseDelay: 0, fetchImpl });
  assert.equal(out, null);
});

test('does not retry on 404', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: false, status: 404, json: async () => ({}) }; };
  const out = await getJSON('http://x', { retries: 3, baseDelay: 0, fetchImpl });
  assert.equal(out, null);
  assert.equal(calls, 1);
});

test('retryTimeout:false gives up after one timed-out attempt', async () => {
  const { postRaw } = await import('../lib/http.mjs');
  let calls = 0;
  const fetchImpl = (url, init) => { calls++; return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))); };
  const out = await postRaw('http://x', { body: {}, timeout: 20, retries: 3, baseDelay: 0, retryTimeout: false, fetchImpl });
  assert.equal(calls, 1);
  assert.equal(out.ok, false);
  assert.equal(out.timedOut, true);
});

test('timeouts are still retried by default (source fetches)', async () => {
  let calls = 0;
  const fetchImpl = (url, init) => { calls++; return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))); };
  const out = await getJSON('http://x', { timeout: 10, retries: 2, baseDelay: 0, fetchImpl });
  assert.equal(out, null);
  assert.equal(calls, 3);
});
