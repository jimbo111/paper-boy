# paper-boy

Fetch **real** recent academic papers on a topic from arXiv, Semantic Scholar, and
OpenAlex, curate them with an LLM, and deliver a **single self-contained HTML reader**
you can open offline. The Markdown report, enriched JSON, and BibTeX are all
downloadable from the reader's in-browser **Export** menu.

It runs two ways:

- as a **slash command inside Claude Code** (`/paper-boy <topic>`), where the editing
  session does the curation, or
- as a **standalone CLI** with your own AI provider key (Anthropic, OpenAI, DeepSeek,
  or any OpenAI-compatible endpoint).

## The one rule: no fabrication

Papers are fetched, never invented. Every title, link, date, author, and citation count
comes from a real source response. The LLM only annotates papers that the fetch step
actually returned, grounded strictly in their real abstracts (and full text, when a
deep-dive can retrieve it). If a paper has no abstract, the summary stays minimal rather
than guessing. This is the entire value of the tool.

## Requirements

- Node.js ≥ 18 (uses the built-in test runner and `fetch`; **zero npm dependencies**).
- For the standalone path: an API key for one of the supported providers.

## Install

```bash
git clone https://github.com/jimbo111/paper-boy.git
cd paper-boy
npm test   # optional: 96 tests, no network needed
```

To use it as a Claude Code slash command, place (or symlink) this directory at
`~/.claude/paper-boy/` and copy `command/paper-boy.md` into your Claude Code commands
directory. Then run `/paper-boy <topic>` from a session.

## The pipeline

paper-boy is three small, composable stages:

```
fetch  →  enrich  →  render
```

1. **fetch** (`bin/fetch.mjs`) — queries arXiv + Semantic Scholar + OpenAlex in
   parallel, dedupes by DOI / arXiv id / normalized title, and writes
   `papers.raw.json`. Deterministic, no LLM.
2. **enrich** (`bin/enrich.mjs`) — calls your chosen AI provider to add per-paper
   summaries, relevance scores, thematic clusters, and full-text deep-dives, writing
   `papers.enriched.json`.
3. **render** (`bin/render.mjs`) — turns the enriched JSON into a single
   `index.html` with fonts and data inlined. No external requests at view time.

## Standalone usage

```bash
# 1. fetch real papers
node bin/fetch.mjs --query "vision language model fine-tuning" --since 2024-12-01 --out run/papers.raw.json

# 2. enrich with your own model
export ANTHROPIC_API_KEY=sk-...
node bin/enrich.mjs --in run/papers.raw.json --out run/papers.enriched.json

# 3. render the reader
node bin/render.mjs --in run/papers.enriched.json
```

### Providers and keys

| Provider | `--provider` | API key env var | Default model |
|----------|--------------|-----------------|---------------|
| Anthropic (Claude) | `anthropic` | `ANTHROPIC_API_KEY` | `claude-opus-4-8` |
| OpenAI (GPT) | `openai` | `OPENAI_API_KEY` | `gpt-4o` |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| OpenAI-compatible / local | `openai-compat` | `PAPER_BOY_API_KEY` | (pass `--model`) |

The `openai-compat` provider points at any OpenAI-compatible `--base-url`, which covers
Groq, Together, Ollama, vLLM, and Gemini's compatibility endpoint:

```bash
node bin/enrich.mjs --in run/papers.raw.json \
  --provider openai-compat --base-url http://localhost:11434/v1 --model llama3.1
```

### Configuration

Settings resolve with the precedence **flag > environment variable > config file > default**.

Flags: `--provider`, `--model`, `--api-key`, `--base-url`, `--deep N`, `--concurrency N`,
`--rps N`, `--config <path>`.

Environment variables: `PAPER_BOY_PROVIDER`, `PAPER_BOY_MODEL`, `PAPER_BOY_BASE_URL`,
`PAPER_BOY_API_KEY` (and the provider-specific key vars above), `PAPER_BOY_CONCURRENCY`,
`PAPER_BOY_RPS`, `PAPER_BOY_DEEP`, `PAPER_BOY_CONFIG`.

Optional config file at `~/.config/paper-boy/config.json` (override the path with
`PAPER_BOY_CONFIG`):

```json
{
  "provider": "anthropic",
  "model": "claude-opus-4-8",
  "apiKey": "sk-...",
  "maxConcurrency": 4,
  "rps": 2,
  "deep": 5
}
```

API keys are never logged. A malformed config file is ignored with a warning rather than
aborting the run. Keep any local `config.json` or `.env` out of version control (both are
gitignored).

### Data-source keys (optional)

`fetch` works with no keys at all. To raise rate limits, set `S2_API_KEY` for Semantic
Scholar and `PAPER_BOY_MAILTO` (your email) to join OpenAlex's faster "polite pool".
Neither is required and neither is ever hardcoded.

## Deep-dives and the full-text limitation

For the top `--deep N` must-read papers, enrich tries to retrieve full text and extract
structured findings, method, and limitations. The retrieval ladder is dependency-free:

1. ar5iv HTML render (`ar5iv.org/abs/<id>`)
2. arXiv native HTML (`arxiv.org/html/<id>`)
3. abstract-only fallback (clearly flagged; the model is told it only has the abstract
   and must not invent method details)

Reliable PDF text extraction with zero dependencies is not feasible, so paper-boy does
**not** parse PDFs by default. If a `pdftotext` binary is on your `PATH` you can wire it
in as an optional escape hatch, but the default path relies on HTML renders. A failed
deep-dive never aborts the run — that paper simply keeps its abstract-level summary.

## Related work (optional)

Pass `--related N` to enrich to expand each must-read paper's **most-cited references**
via the OpenAlex citation graph. This is deterministic (no AI key required) and off by
default:

```bash
node bin/enrich.mjs --in run/papers.raw.json --related 5
```

Each must-read then carries a `related[]` list (title, authors, year, citations, link),
shown in the reader under the paper and never fabricated — an unreachable reference list
simply yields an empty result.

## Exports

The reader's **Export** menu downloads everything client-side, with nothing written to a
server: the Markdown report, the enriched JSON, a **BibTeX** library, and an **RIS** file
for direct import into Zotero, Mendeley, or EndNote.

## Output

Runs land in `~/paper-boy/<slug>/<date>/`:

- `index.html` — the self-contained reader (open it in any browser)
- `papers.raw.json` — the deduped fetch result (audit trail)
- `papers.enriched.json` — the curated data the reader is built from

## Development

```bash
npm test            # all tests
npm run test:offline  # skip the one network smoke test
```

Tests use only Node's built-in `node:test`. See `ARCHITECTURE.md` for the module layout
and `CONTRIBUTING.md` for how to add a provider or data source.

## License

MIT — see `LICENSE`. The bundled Newsreader font is licensed separately under the SIL
Open Font License (`template/fonts/OFL.txt`).
