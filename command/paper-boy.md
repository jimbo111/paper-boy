---
description: Deliver recent academic papers on a topic as a self-contained interactive HTML reader — with Markdown / JSON / BibTeX downloadable from it (arXiv + Semantic Scholar + OpenAlex)
argument-hint: <topic> [--since YYYY-MM-DD] [--max 40] [--deep 5] [--no-open]
---

# 📰 paper-boy

Fetch **real** recent papers on a topic from arXiv + Semantic Scholar + OpenAlex, curate them, and deliver a self-contained interactive HTML reader. The Markdown report, enriched JSON, and BibTeX are all downloadable from the reader's **Export** menu.

**Engine:** `~/.claude/paper-boy/` · **Output:** `~/paper-boy/<slug>/<date>/`

## Input

`$ARGUMENTS` = a topic, optionally followed by flags:
- `--since YYYY-MM-DD` — earliest publish date (default: 18 months ago)
- `--max N` — final number of papers to keep (default: 40)
- `--deep N` — how many top must-reads to full-text deep-dive (default: 5)
- `--field X` — optional extra term to AND into the query (e.g. `cs.CV`, `clinical`)
- `--no-open` — don't auto-open the HTML

## THE ONE RULE

**Papers are fetched, never invented.** You only annotate the papers the fetch script returns. Never add a paper, URL, date, author, or citation count that is not already in `papers.raw.json`. Every `whatsNew`/`whyItMatters`/`tldr` must be grounded in that paper's real abstract. If a paper has no abstract, say so and keep the summary minimal. This is the entire value of the tool — do not break it.

## Workflow

### Step 0 — Anchor the date & parse args
Run:
```bash
date +%F                 # today
date -v-18m +%F          # default --since (macOS)
```
Parse the topic and flags out of `$ARGUMENTS`. Build the effective query = topic (+ ` --field` term if given). Compute `SLUG` = topic lowercased, non-alphanumerics → `-`.

### Step 1 — Make the run directory
```bash
RUN="$HOME/paper-boy/<SLUG>/$(date +%F)"
mkdir -p "$RUN"
```

### Step 2 — Fetch (deterministic)
```bash
node ~/.claude/paper-boy/bin/fetch.mjs --query "<topic>" --since <SINCE> --max <MAX> --out "$RUN/papers.raw.json"
```
Read `$RUN/papers.raw.json`. If `meta.total` is 0, tell the user no papers matched and suggest broader terms or an earlier `--since`. Stop.
(Note: Semantic Scholar's free API is rate-limited and may return 0 — that's fine, arXiv + OpenAlex carry the run. Set `S2_API_KEY` in the env for better S2 coverage. Optionally set `PAPER_BOY_MAILTO` to your email to join OpenAlex's faster "polite pool".)

### Step 3 — Enrich → `papers.enriched.json`
For every paper in `papers.raw.json`, produce an enriched record. Then rank, cluster, and select. Write the result to `$RUN/papers.enriched.json` matching **exactly** this shape:

```json
{
  "meta": { "topic": "...", "query": "...", "slug": "...", "since": "YYYY-MM-DD",
            "generatedAt": "YYYY-MM-DD", "sources": {"arxiv": N, "s2": N, "openalex": N}, "total": N },
  "trending": "1-3 sentences on what's heating up across these papers",
  "clusters": [ { "name": "Short Topic Name", "synthesis": "one-line takeaway", "paperIds": ["id", "..."] } ],
  "startHere": ["id", "id", "id"],
  "papers": [
    {
      "...all original fields from the raw paper (id, title, authors, abstract, tldr, publishedDate, year, venue, citationCount, influentialCitationCount, fields, sources, arxivId, doi, links)...": "unchanged",
      "whatsNew": "1-2 lines: the core new contribution, from the real abstract",
      "whyItMatters": "1 line: why a practitioner on this topic should care",
      "summary": "2-4 sentences, plain language, grounded strictly in the real abstract (+ deepDive if present)",
      "clusters": ["matching cluster name(s)"],
      "relevance": 0.0,
      "score": 0.0,
      "mustRead": false,
      "deepDive": null
    }
  ]
}
```

Rules:
- **Copy** every original field through unchanged. Only ADD the new fields.
- `summary` (every kept paper): 2–4 sentences in plain language, written **only** from the paper's real abstract (plus its `deepDive` if present). No numbers, results, or claims that aren't in the source. If a paper has no abstract, write one honest sentence from the title/venue and keep it minimal — never invent. This is the per-paper read shown in the reader and report; it is held to the same no-fabrication bar as everything else.
- `relevance` (0–1): how on-topic the paper is for `<topic>`. Be honest — OpenAlex over-returns; score loosely-related papers low.
- `score` = `relevance × recencyDecay × citationBoost`, where `recencyDecay` favors newer `publishedDate` (e.g. ~1.0 this month decaying toward ~0.5 at the `--since` edge) and `citationBoost` = `1 + log10(1 + citationCount)/2`. Sort `papers` by `score` descending.
- Keep the top `--max` by score; **drop papers with `relevance < 0.35`** even if that means fewer than `--max` (quality over quantity).
- `mustRead`: flag the top 3–5 by score.
- `clusters`: 3–6 named groups; give each a one-line `synthesis`; every kept paper goes in ≥1 cluster's `paperIds`.
- `startHere`: the must-read ids, best first.
- Set `meta.generatedAt` to today; carry `meta.sources`/`since`/`slug`/`topic` from raw; set `meta.total` to the number of kept papers.

### Step 4 — Deep-dive the top `--deep` must-reads
For each must-read (highest score first, up to `--deep`):
1. Try the arXiv HTML full text if it has an `arxivId`: `WebFetch https://arxiv.org/html/<arxivId>` (fallback `https://ar5iv.org/abs/<arxivId>`).
2. Else if `links.pdf` exists: `mkdir -p "$RUN/pdf"` then `curl -sL "<pdf>" -o "$RUN/pdf/<safe>.pdf"` and Read that PDF — where `<safe>` is the paper id with every non-alphanumeric char replaced by `_` (ids like `doi:10.x/y` contain `/` and would otherwise create a bad path).
3. Else skip.
Extract and set that paper's `deepDive`:
```json
{ "findings": ["concrete result", "..."], "method": "1-2 line approach", "limitations": ["..."], "fullText": "read" }
```
If full text can't be retrieved, set `deepDive` to `{ "findings": [], "method": "", "limitations": [], "fullText": "unavailable" }`. A single failure must not abort the run — move on.
Re-write `$RUN/papers.enriched.json` with the deepDive fields filled in.

### Step 5 — Render (deterministic)
```bash
node ~/.claude/paper-boy/bin/render.mjs --in "$RUN/papers.enriched.json" <--no-open if requested>
```
This writes a single self-contained `$RUN/index.html` and opens it. The Markdown report, enriched JSON, and BibTeX are embedded and downloadable from the reader's in-browser **Export** menu — they are no longer written to disk separately. `papers.raw.json` and `papers.enriched.json` remain on disk as the audit trail.

### Step 6 — Report back
Tell the user, concisely:
- Source counts (arXiv / S2 / OpenAlex) and how many papers were kept.
- The "Start here" titles, each with its one-line `whatsNew`.
- The output path (`$RUN`) and that the HTML reader opened in their browser — note they can download the Markdown / JSON / BibTeX from the reader's **Export** menu.

## Notes
- Light annotation of the whole pool is cheap; the deep-dive PDF reads are the expensive part — respect `--deep`.
- Never present a paper you couldn't fetch. If you're unsure a link is real, it came from the script — trust the script, not your memory.

## Standalone / bring-your-own-key

The curation above is done by the Claude Code session. The same pipeline also runs
**outside** Claude Code with your own AI provider key, via `bin/enrich.mjs`:

```bash
node bin/fetch.mjs  --query "<topic>" --since <date> --out run/papers.raw.json
ANTHROPIC_API_KEY=sk-... \
node bin/enrich.mjs --in run/papers.raw.json --out run/papers.enriched.json
node bin/render.mjs --in run/papers.enriched.json
```

- **Providers:** `--provider anthropic|openai|deepseek|openai-compat` (default `anthropic`).
  `openai-compat` takes a `--base-url` for Groq / Together / Ollama / vLLM / Gemini-compat.
- **Keys:** provider env var (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`),
  or `PAPER_BOY_API_KEY`, or `--api-key`, or `~/.config/paper-boy/config.json`.
- **Precedence:** flag > env var > config file > default.
- **Deep-dive ladder:** ar5iv HTML → arXiv HTML → abstract-only (flagged, never fabricated).

See `README.md` for the full flag/config reference.
