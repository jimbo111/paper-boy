#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveConfig } from '../lib/config.mjs';
import { getProvider } from '../lib/llm/provider.mjs';
import { makeClient } from '../lib/llm/client.mjs';
import { makeFakeClient } from '../lib/llm/fake.mjs';
import { enrichAll } from '../lib/enrich/orchestrate.mjs';
import { fetchFullText } from '../lib/fulltext/extract.mjs';

function parseArgs(argv) {
  const o = {};
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') o.in = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--provider') flags.provider = argv[++i];
    else if (a === '--model') flags.model = argv[++i];
    else if (a === '--api-key') flags.apiKey = argv[++i];
    else if (a === '--base-url') flags.baseUrl = argv[++i];
    else if (a === '--config') flags.config = argv[++i];
    else if (a === '--deep') flags.deep = Number(argv[++i]);
    else if (a === '--concurrency') flags.maxConcurrency = Number(argv[++i]);
    else if (a === '--rps') flags.rps = Number(argv[++i]);
  }
  return { o, flags };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const { o, flags } = parseArgs(process.argv.slice(2));
  const inPath = o.in || 'papers.raw.json';
  const outPath = o.out || inPath.replace(/raw\.json$/, 'enriched.json').replace(/\.json$/, '.enriched.json');

  let raw;
  try { raw = JSON.parse(readFileSync(inPath, 'utf8')); }
  catch (err) { console.error(`paper-boy enrich: cannot read ${inPath} (${err.message})`); process.exit(2); }
  if (!raw || !Array.isArray(raw.papers)) { console.error('paper-boy enrich: input has no papers[]'); process.exit(2); }

  const cfg = resolveConfig({ flags });

  // Offline deterministic path for CI / dry runs — no key, no network.
  const fake = process.env.PAPER_BOY_FAKE_LLM === '1';
  let client;
  if (fake) {
    client = makeFakeClient();
  } else {
    let provider;
    try { provider = getProvider(cfg.provider, { baseUrl: cfg.baseUrl }); }
    catch (err) { console.error(`paper-boy enrich: ${err.message}`); process.exit(2); }
    if (!cfg.apiKey) {
      console.error(`paper-boy enrich: no API key for provider "${cfg.provider}". ` +
        'Set the provider env var (e.g. ANTHROPIC_API_KEY), PAPER_BOY_API_KEY, --api-key, or the config file.');
      process.exit(2);
    }
    client = makeClient({
      provider, model: cfg.model, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl,
      rps: cfg.rps, maxConcurrency: cfg.maxConcurrency,
    });
  }

  const enriched = await enrichAll({
    raw,
    client,
    fetchFullText,
    today: today(),
    deep: cfg.deep,
    maxConcurrency: cfg.maxConcurrency,
    log: (m) => console.error(`paper-boy: ${m}`),
  });

  mkdirSync(dirname(outPath) || '.', { recursive: true });
  writeFileSync(outPath, JSON.stringify(enriched, null, 2));

  const deepDone = enriched.papers.filter((p) => p.deepDive && p.deepDive.fullText === 'read').length;
  const abstractOnly = enriched.papers.filter((p) => p.deepDive && p.deepDive.fullText === 'abstract').length;
  console.error(
    `paper-boy: enriched ${enriched.papers.length} papers · ${enriched.clusters.length} clusters · ` +
    `${deepDone} deep-dives (${abstractOnly} abstract-only) · model ${client.model} → ${outPath}`,
  );
}

main();
