import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient } from '../lib/llm/client.mjs';

// A provider whose response simply echoes a queued body string back as model text.
function echoProvider(queue) {
  return {
    name: 'echo',
    defaultModel: 'echo-1',
    buildRequest: ({ prompt }) => ({ url: 'http://x', method: 'POST', headers: {}, body: { prompt } }),
    parseResponse: (b) => ({ text: b.text, stopReason: 'stop' }),
  };
}

// Fake POST transport: pops the next scripted result off `script`.
function scriptedPost(script) {
  return async () => {
    const next = script.shift();
    if (next.status && next.status !== 200) return { ok: false, status: next.status, body: next.body || '' };
    return { ok: true, status: 200, body: JSON.stringify({ text: next.text }) };
  };
}

test('returns parsed JSON on a clean first response', async () => {
  const client = makeClient({ provider: echoProvider(), rps: 0, postImpl: scriptedPost([{ text: '{"relevance":0.7}' }]) });
  const r = await client.complete({ prompt: 'p', schema: { required: ['relevance'] } });
  assert.equal(r.ok, true);
  assert.equal(r.data.relevance, 0.7);
});

test('re-prompts and recovers from malformed JSON', async () => {
  const script = [{ text: 'sorry, here: not-json' }, { text: '{"ok":1}' }];
  const client = makeClient({ provider: echoProvider(), rps: 0, postImpl: scriptedPost(script) });
  const r = await client.complete({ prompt: 'p', schema: { required: ['ok'] } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { ok: 1 });
  assert.equal(script.length, 0, 'used both scripted responses');
});

test('gives up after maxRepairRetries with an error (never throws)', async () => {
  const script = [{ text: 'no' }, { text: 'still no' }, { text: 'nope' }];
  const client = makeClient({ provider: echoProvider(), rps: 0, maxRepairRetries: 2, postImpl: scriptedPost(script) });
  const r = await client.complete({ prompt: 'p', schema: { required: ['x'] } });
  assert.equal(r.ok, false);
  assert.match(r.error, /unparseable/);
});

test('maps 401 to an auth error and does not retry', async () => {
  let calls = 0;
  const post = async () => { calls++; return { ok: false, status: 401, body: '' }; };
  const client = makeClient({ provider: echoProvider(), rps: 0, postImpl: post });
  const r = await client.complete({ prompt: 'p', schema: { required: ['x'] } });
  assert.equal(r.ok, false);
  assert.match(r.error, /authentication/);
  assert.equal(calls, 1, 'auth errors are not re-prompted');
});

test('rate limiter spaces out concurrently-enqueued requests', async () => {
  const starts = [];
  const post = async () => {
    starts.push(Date.now());
    return { ok: true, status: 200, body: JSON.stringify({ text: '{"x":1}' }) };
  };
  // 3 requests at 5 rps → 200ms gaps; lenient bound to stay CI-safe.
  const client = makeClient({ provider: echoProvider(), rps: 5, maxConcurrency: 4, postImpl: post });
  await Promise.all([1, 2, 3].map(() => client.complete({ prompt: 'p', schema: { required: ['x'] } })));
  assert.equal(starts.length, 3);
  assert.ok(starts[2] - starts[0] >= 300, `expected ≥300ms spread, got ${starts[2] - starts[0]}ms`);
});

test('schema-less completion returns raw text', async () => {
  const client = makeClient({ provider: echoProvider(), rps: 0, postImpl: scriptedPost([{ text: 'plain text' }]) });
  const r = await client.complete({ prompt: 'p' });
  assert.equal(r.ok, true);
  assert.equal(r.data, 'plain text');
});

test('a truncated reply retries with a raised token ceiling and the original prompt', async () => {
  const calls = [];
  const provider = {
    name: 'echo',
    defaultModel: 'echo-1',
    buildRequest: ({ prompt, maxTokens }) => { calls.push({ prompt, maxTokens }); return { url: 'http://x', method: 'POST', headers: {}, body: {} }; },
    parseResponse: (b) => ({ text: b.text, stopReason: b.stop }),
  };
  const script = [
    { text: '{"a": "cut off mid-str', stop: 'max_tokens' }, // truncated → unparseable
    { text: '{"a": 1}', stop: 'stop' },
  ];
  const post = async () => ({ ok: true, status: 200, body: JSON.stringify(script.shift()) });
  const client = makeClient({ provider, rps: 0, postImpl: post });
  const r = await client.complete({ prompt: 'ORIGINAL', schema: { required: ['a'] }, maxTokens: 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.data.a, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].maxTokens, 2000); // doubled, not re-prompted at the same ceiling
  assert.equal(calls[1].prompt, 'ORIGINAL'); // no repair preamble — the reply was cut, not malformed
});

test('LLM POSTs carry a long timeout override', async () => {
  let seen;
  const post = async (url, opts) => { seen = opts; return { ok: true, status: 200, body: JSON.stringify({ text: '{"a":1}' }) }; };
  const client = makeClient({ provider: echoProvider(), rps: 0, postImpl: post });
  await client.complete({ prompt: 'p', schema: { required: ['a'] } });
  assert.equal(seen.timeout, 120000);
});
