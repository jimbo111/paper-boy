import { test } from 'node:test';
import assert from 'node:assert/strict';
import openai from '../lib/llm/openai.mjs';
import deepseek from '../lib/llm/deepseek.mjs';
import { getProvider } from '../lib/llm/provider.mjs';
import { makeProvider } from '../lib/llm/openai-compat.mjs';

test('openai preset: base URL, bearer auth, default model', () => {
  const r = openai.buildRequest({ model: openai.defaultModel, apiKey: 'k', system: 's', prompt: 'p' });
  assert.equal(r.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(r.headers.authorization, 'Bearer k');
  assert.equal(openai.defaultModel, 'gpt-4o');
  assert.deepEqual(r.body.messages, [{ role: 'system', content: 's' }, { role: 'user', content: 'p' }]);
});

test('deepseek preset points at the deepseek base + model', () => {
  const r = deepseek.buildRequest({ model: deepseek.defaultModel, apiKey: 'k', prompt: 'p' });
  assert.equal(r.url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(deepseek.defaultModel, 'deepseek-chat');
});

test('schema yields response_format json_object', () => {
  const r = openai.buildRequest({ model: 'm', apiKey: 'k', prompt: 'p', schema: { type: 'object' } });
  assert.equal(r.body.response_format.type, 'json_object');
});

test('parseResponse reads choices[0].message.content', () => {
  const { text } = openai.parseResponse({ choices: [{ message: { content: '{"ok":1}' }, finish_reason: 'stop' }] });
  assert.equal(text, '{"ok":1}');
});

test('getProvider returns generic adapter for openai-compat with a baseUrl', () => {
  const p = getProvider('openai-compat', { baseUrl: 'http://localhost:11434/v1' });
  const r = p.buildRequest({ model: 'llama', apiKey: 'x', prompt: 'p' });
  assert.equal(r.url, 'http://localhost:11434/v1/chat/completions');
});

test('getProvider throws on unknown provider, and on compat without baseUrl', () => {
  assert.throws(() => getProvider('mystery'), /unknown provider/);
  assert.throws(() => getProvider('openai-compat'), /baseUrl/);
});

test('makeProvider is the shared shape behind the presets', () => {
  const p = makeProvider({ name: 'x', defaultModel: 'mm', defaultBase: 'https://api.x/v1' });
  assert.equal(p.name, 'x');
  assert.equal(p.defaultModel, 'mm');
});
