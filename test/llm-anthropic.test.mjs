import { test } from 'node:test';
import assert from 'node:assert/strict';
import anthropic from '../lib/llm/anthropic.mjs';

test('buildRequest targets /v1/messages with auth + version headers', () => {
  const r = anthropic.buildRequest({ model: 'claude-opus-4-8', apiKey: 'sk-x', system: 'sys', prompt: 'hi' });
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.method, 'POST');
  assert.equal(r.headers['x-api-key'], 'sk-x');
  assert.equal(r.headers['anthropic-version'], '2023-06-01');
  assert.equal(r.body.model, 'claude-opus-4-8');
  assert.equal(r.body.system, 'sys');
  assert.deepEqual(r.body.messages, [{ role: 'user', content: 'hi' }]);
});

test('buildRequest attaches json_schema output_config when schema given', () => {
  const schema = { type: 'object' };
  const r = anthropic.buildRequest({ model: 'm', apiKey: 'k', prompt: 'p', schema });
  assert.equal(r.body.output_config.format.type, 'json_schema');
  assert.deepEqual(r.body.output_config.format.schema, schema);
});

test('buildRequest honours a custom baseUrl', () => {
  const r = anthropic.buildRequest({ model: 'm', apiKey: 'k', prompt: 'p', baseUrl: 'https://proxy.local/' });
  assert.equal(r.url, 'https://proxy.local/v1/messages');
});

test('parseResponse concatenates text content blocks', () => {
  const { text } = anthropic.parseResponse({ content: [{ type: 'text', text: 'a' }, { type: 'thinking', text: 'x' }, { type: 'text', text: 'b' }] });
  assert.equal(text, 'ab');
});

test('parseResponse throws on a refusal stop reason', () => {
  assert.throws(() => anthropic.parseResponse({ stop_reason: 'refusal', content: [] }), /refus/);
});
