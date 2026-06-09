# Contributing

Thanks for your interest in improving paper-boy. The project is intentionally small and
dependency-free; please keep it that way.

## Setup

```bash
git clone https://github.com/jimbo111/paper-boy.git
cd paper-boy
npm test
```

There is nothing to install — paper-boy runs on the Node ≥ 18 standard library.

## Ground rules

- **No runtime dependencies.** Use only Node built-ins. A new dependency needs a strong
  justification in the pull request.
- **No fabrication.** Any change that lets the tool present a paper, link, number, or
  claim that did not come from a real source response will be rejected. Enrichment must
  stay grounded in fetched abstracts and full text.
- **Pure core, thin shells.** Put logic in small `lib/` modules that export a pure
  builder and a pure parser, with I/O isolated in a thin wrapper. Pass effectful
  collaborators as arguments so they can be injected in tests.
- **Tests required.** Every change ships with `node:test` coverage and must run offline.
  Run `npm test` before opening a pull request.
- **Match the surrounding style.** Small modules, no transpilation, ESM, terse comments
  that explain *why*.

## How to add an AI provider

1. Add `lib/llm/<name>.mjs`. If the provider speaks the OpenAI chat-completions dialect,
   make it a one-line preset over `makeProvider` in `openai-compat.mjs`. Otherwise
   implement the adapter interface directly: a pure
   `buildRequest({ model, apiKey, baseUrl, system, prompt, schema, maxTokens })` returning
   `{ url, method, headers, body }`, and a pure `parseResponse(body)` returning
   `{ text, usage, stopReason }`.
2. Register it in `lib/llm/provider.mjs`.
3. If it uses a conventional key env var, add it to `KEY_ENV` in `lib/config.mjs`.
4. Add a test mirroring `test/llm-openai-compat.test.mjs`.

## How to add a data source

1. Add `lib/sources/<name>.mjs` with a pure URL/query builder, a pure parser that returns
   papers in the raw schema (see `ARCHITECTURE.md`), and a thin `fetch*` function.
2. Wire it into `bin/fetch.mjs`'s parallel fetch + interleave.
3. Add a fixture under `fixtures/` and a parser test.

## Commit and PR style

- One logical change per commit; imperative subject line under ~50 characters.
- Group a coherent feature into a single pull request.
- Describe the *why* in the body, and note any new environment variables or flags.
