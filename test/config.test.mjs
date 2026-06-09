import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from '../lib/config.mjs';

const noFile = () => { const e = new Error('nope'); e.code = 'ENOENT'; throw e; };
const base = { home: '/home/u', readFile: noFile, warn: () => {} };

test('defaults apply when nothing else is set', () => {
  const c = resolveConfig({ ...base, flags: {}, env: {} });
  assert.equal(c.provider, 'anthropic');
  assert.equal(c.maxConcurrency, 4);
  assert.equal(c.rps, 2);
  assert.equal(c.deep, 5);
  assert.equal(c.apiKey, undefined);
});

test('flag beats env beats file beats default', () => {
  const readFile = () => JSON.stringify({ provider: 'deepseek', deep: 1, model: 'file-model' });
  // file says deepseek/1, env overrides deep, flag overrides provider
  const c = resolveConfig({
    ...base, readFile,
    env: { PAPER_BOY_DEEP: '7' },
    flags: { provider: 'openai' },
  });
  assert.equal(c.provider, 'openai');   // flag
  assert.equal(c.deep, 7);              // env over file
  assert.equal(c.model, 'file-model');  // file over default
});

test('API key resolves provider-specific env first, then generic, then file', () => {
  const readFile = () => JSON.stringify({ apiKey: 'from-file' });
  const anth = resolveConfig({ ...base, readFile, env: { ANTHROPIC_API_KEY: 'a-key' }, flags: { provider: 'anthropic' } });
  assert.equal(anth.apiKey, 'a-key');

  const generic = resolveConfig({ ...base, readFile, env: { PAPER_BOY_API_KEY: 'g-key' }, flags: { provider: 'openai' } });
  assert.equal(generic.apiKey, 'g-key');

  const file = resolveConfig({ ...base, readFile, env: {}, flags: { provider: 'openai' } });
  assert.equal(file.apiKey, 'from-file');

  const flag = resolveConfig({ ...base, readFile, env: { OPENAI_API_KEY: 'env' }, flags: { provider: 'openai', apiKey: 'flag-key' } });
  assert.equal(flag.apiKey, 'flag-key');
});

test('provider-specific env only applies to the active provider', () => {
  // OPENAI_API_KEY must NOT leak into an anthropic run.
  const c = resolveConfig({ ...base, env: { OPENAI_API_KEY: 'o' }, flags: { provider: 'anthropic' } });
  assert.equal(c.apiKey, undefined);
});

test('malformed config file warns and continues with defaults', () => {
  let warned = '';
  const c = resolveConfig({
    ...base,
    readFile: () => '{ not json',
    warn: (m) => { warned = m; },
    env: {}, flags: {},
  });
  assert.match(warned, /malformed config/);
  assert.equal(c.provider, 'anthropic');
});

test('PAPER_BOY_CONFIG overrides the config path', () => {
  let seen = '';
  resolveConfig({ ...base, env: { PAPER_BOY_CONFIG: '/custom/c.json' }, readFile: (p) => { seen = p; return '{}'; }, flags: {} });
  assert.equal(seen, '/custom/c.json');
});
