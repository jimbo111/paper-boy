import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Provider-specific environment variable that holds the API key.
const KEY_ENV = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};

const DEFAULTS = {
  provider: 'anthropic',
  maxConcurrency: 4,
  rps: 2,
  deep: 5,
};

// Read the optional config file. Missing → {}. Malformed → warn and continue with {}
// so a broken file never aborts a run.
function loadFile(path, readFile, warn) {
  try {
    return JSON.parse(readFile(path, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return {};
    warn(`paper-boy: ignoring malformed config at ${path} (${err.message})`);
    return {};
  }
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// Resolve effective config. Per-key precedence: flag > env > file > default.
// Dependencies are injected (env, readFile, home, warn) so this is fully testable
// with no real filesystem or process.env access.
export function resolveConfig({
  flags = {},
  env = process.env,
  readFile = readFileSync,
  home = homedir(),
  warn = (m) => console.error(m),
} = {}) {
  const path = flags.config || env.PAPER_BOY_CONFIG ||
    join(home, '.config', 'paper-boy', 'config.json');
  const file = loadFile(path, readFile, warn);

  // flag > env > file > default, resolved independently per key.
  const pick = (flagVal, envVal, fileVal, def) =>
    flagVal !== undefined ? flagVal
      : envVal !== undefined && envVal !== '' ? envVal
        : fileVal !== undefined ? fileVal
          : def;

  const provider = pick(flags.provider, env.PAPER_BOY_PROVIDER, file.provider, DEFAULTS.provider);

  // API key precedence: --api-key > provider-specific env > generic env > file.
  // Never defaulted, never logged.
  const apiKey = flags.apiKey
    || env[KEY_ENV[provider]]
    || env.PAPER_BOY_API_KEY
    || file.apiKey
    || undefined;

  return Object.freeze({
    provider,
    model: pick(flags.model, env.PAPER_BOY_MODEL, file.model, undefined),
    apiKey,
    baseUrl: pick(flags.baseUrl, env.PAPER_BOY_BASE_URL, file.baseUrl, undefined),
    maxConcurrency: num(pick(flags.maxConcurrency, env.PAPER_BOY_CONCURRENCY, file.maxConcurrency, DEFAULTS.maxConcurrency)),
    rps: num(pick(flags.rps, env.PAPER_BOY_RPS, file.rps, DEFAULTS.rps)),
    deep: num(pick(flags.deep, env.PAPER_BOY_DEEP, file.deep, DEFAULTS.deep)),
    configPath: path,
  });
}

export { KEY_ENV, DEFAULTS };
