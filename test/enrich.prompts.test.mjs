import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as prompts from '../lib/enrich/prompts.mjs';

// Structured-output endpoints reject numeric/string/array constraints — a raw request
// (no SDK to strip them) must never carry one.
const UNSUPPORTED = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems'];

function walk(node, path, found) {
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (UNSUPPORTED.includes(k)) found.push(`${path}.${k}`);
    walk(v, `${path}.${k}`, found);
  }
}

test('no enrichment schema uses a keyword structured outputs reject', () => {
  const schemas = Object.entries(prompts).filter(([name]) => name.endsWith('_SCHEMA'));
  assert.ok(schemas.length >= 5);
  const found = [];
  for (const [name, s] of schemas) walk(s, name, found);
  assert.deepEqual(found, []);
});
