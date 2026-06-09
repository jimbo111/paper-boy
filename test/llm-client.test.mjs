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

test('schema-less completion returns raw text', async () => {
  const client = makeClient({ provider: echoProvider(), rps: 0, postImpl: scriptedPost([{ text: 'plain text' }]) });
  const r = await client.complete({ prompt: 'p' });
  assert.equal(r.ok, true);
  assert.equal(r.data, 'plain text');
});
