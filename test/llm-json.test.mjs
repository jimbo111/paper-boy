import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, tryExtractJson } from '../lib/llm/json.mjs';

test('parses clean JSON', () => {
  assert.deepEqual(extractJson('{"a":1,"b":[2,3]}'), { a: 1, b: [2, 3] });
});

test('strips ```json code fences', () => {
  assert.deepEqual(extractJson('```json\n{"x":true}\n```'), { x: true });
});

test('extracts JSON embedded in prose', () => {
  const t = 'Sure! Here is the result:\n{"name":"k","ids":["a","b"]}\nHope that helps.';
  assert.deepEqual(extractJson(t), { name: 'k', ids: ['a', 'b'] });
});

test('ignores braces inside strings when scanning', () => {
  assert.deepEqual(extractJson('prefix {"s":"a } b","n":1} suffix'), { s: 'a } b', n: 1 });
});

test('repairs trailing commas and smart quotes', () => {
  const t = '{“msg”: “hi”, “arr”: [1, 2,],}';
  assert.deepEqual(extractJson(t), { msg: 'hi', arr: [1, 2] });
});

test('handles a top-level array', () => {
  assert.deepEqual(extractJson('here: [1,2,3]'), [1, 2, 3]);
});

test('throws on unrecoverable input', () => {
  assert.throws(() => extractJson('no json here at all'));
  assert.throws(() => extractJson(''));
});

test('tryExtractJson returns ok:false instead of throwing', () => {
  const r = tryExtractJson('garbage');
  assert.equal(r.ok, false);
  assert.match(r.error, /JSON/);
});
