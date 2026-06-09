# Architecture

paper-boy is a three-stage pipeline of small, single-purpose ES modules. Each stage is a
CLI under `bin/` backed by pure helpers in `lib/`. There are no runtime dependencies — only
the Node standard library.

```
fetch.mjs  →  papers.raw.json  →  enrich.mjs  →  papers.enriched.json  →  render.mjs  →  index.html
```

## Design principles

- **No fabrication.** Paper data originates only from source APIs. The enrichment stage
  adds annotations grounded strictly in fetched abstracts and full text. Cluster
  references to unknown paper ids are dropped; unavailable deep-dives degrade to
  abstract-only instead of guessing.
- **Pure core, thin shells.** Each `lib/` module separates a pure request-builder and a
  pure parser from the thin function that performs I/O. This is what makes the suite
  testable without a network.
- **Dependency injection over mocking frameworks.** Functions take their effectful
  collaborators (`fetchImpl`, `getImpl`, `readFile`, `postImpl`, `provider`,
  `fetchFullText`) as arguments, defaulting to the real implementation.
- **Deterministic boundaries.** `fetch` and `render` are deterministic; all
  non-determinism (the model) is confined to `enrich`, behind an injectable client.

## Modules

### Stage 1 — fetch

- `bin/fetch.mjs` — orchestrates the sources, interleaves their rankings, dedupes, writes `papers.raw.json`.
- `lib/sources/{arxiv,semanticscholar,openalex}.mjs` — one adapter per source; each exports a pure URL builder, a pure parser, and a thin `fetch*` function.
- `lib/dedup.mjs` — merges duplicates across sources by DOI → arXiv id → normalized title.
- `lib/http.mjs` — shared `fetch` wrapper with retry/backoff, timeout, and an injectable transport. `getJSON`/`getText` for sources; `postRaw` (returns `{ok,status,headers,body}`) for the LLM client.
- `lib/slug.mjs` — slug + title normalization helpers.

### Stage 2 — enrich

- `bin/enrich.mjs` — resolves config, selects a provider, builds a client, runs the orchestrator, writes `papers.enriched.json`.
- `lib/config.mjs` — `resolveConfig` with **flag > env > file > default** precedence, resolved per key; provider-aware API-key lookup; never logs secrets.
- `lib/llm/` — provider layer:
  - `provider.mjs` — registry / resolver, including the generic `openai-compat` adapter.
  - `anthropic.mjs` — Claude adapter (`/v1/messages`).
  - `openai-compat.mjs` — generic chat-completions builder/parser; `openai.mjs` and `deepseek.mjs` are thin presets over it.
  - `json.mjs` — the JSON repair ladder (fences → balanced-block scan → light fixes).
  - `client.mjs` — sends requests through `postRaw`, applies a token-bucket rate limiter, and re-prompts on malformed JSON. Returns `{ok,data,error}`; never throws.
  - `fake.mjs` — deterministic offline client used when `PAPER_BOY_FAKE_LLM=1`.
- `lib/enrich/prompts.mjs` — prompt text + JSON schemas + the anti-fabrication guardrail.
- `lib/enrich/orchestrate.mjs` — the enrichment passes: per-paper annotation/scoring, low-relevance filtering, clustering, must-read/start-here selection, tiered full-text deep-dives, and trending synthesis.
- `lib/fulltext/extract.mjs` — the dependency-free full-text ladder (ar5iv → arXiv HTML → abstract) and HTML-to-text stripper.
- `lib/sources/openalex.mjs` — also exposes `fetchRelated`, the optional citation-graph expander that attaches each must-read's most-cited references (`--related N`, off by default).

### Stage 3 — render

- `bin/render.mjs` — injects enriched data, the Markdown report, and base64 fonts into the template; writes one self-contained `index.html`.
- `lib/markdown.mjs` — the Markdown report renderer (embedded for the in-reader export).
- `lib/html.mjs` — token replacement and `</script>`-safe data embedding.
- `lib/bibtex.mjs` — per-paper BibTeX generation.
- `lib/ris.mjs` — per-paper RIS generation (Zotero / Mendeley / EndNote import).
- `template/reader.html` — the reader UI (vanilla JS, inline CSS); `template/fonts/` holds the inlined typeface.

## JSON contracts

**`papers.raw.json`** — `{ meta, papers[] }`. Each paper: `id, title, authors, abstract,
tldr, publishedDate, year, venue, citationCount, influentialCitationCount, fields,
sources, arxivId, doi, links`.

**`papers.enriched.json`** — `{ meta, trending, clusters[], startHere[], papers[] }`.
Clusters are `{ name, synthesis, paperIds[] }`. Each paper carries every raw field
unchanged plus `whatsNew, whyItMatters, summary, clusters[], relevance, score, mustRead,
deepDive`. `deepDive` is `null` or `{ findings[], method, limitations[], fullText }`
where `fullText ∈ {read, abstract, unavailable}`.

`render.mjs` consumes this contract directly, so the orchestrator and the smoke test both
validate against `fixtures/papers.enriched.sample.json`.

## Scoring

`score = relevance × recencyDecay × citationBoost`, where `recencyDecay` favors newer
papers (≈1.0 now, decaying toward ≈0.5 at the `--since` edge) and
`citationBoost = 1 + log10(1 + citationCount) / 2`. Papers below a relevance floor are
dropped; the top few by score become must-reads and seed `startHere`.

## Testing

All tests use `node:test` and run offline. Unit tests cover the source parsers, dedup,
BibTeX, HTML safety, config precedence, the provider request builders, the JSON repair
ladder, the LLM client's repair/error handling, and the full-text ladder. Two smoke tests
shell out to the CLIs: `enrich.mjs` under the fake LLM, and `render.mjs` against the
enriched fixture.
