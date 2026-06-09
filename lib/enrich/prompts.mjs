// Prompts + JSON schemas for the standalone enrichment passes. Kept separate so the
// wording (and the anti-fabrication guardrails) are reviewable and testable.

// The single rule that protects the whole tool's value.
export const GUARDRAIL =
  'Ground every word strictly in the provided text. Never invent a finding, number, ' +
  'author, date, venue, or citation. If the abstract is thin, keep the output minimal ' +
  'and honest rather than padding it. Output JSON only — no prose, no code fences.';

const paperLine = (p) => {
  const parts = [
    `id: ${p.id}`,
    `title: ${p.title || '(untitled)'}`,
    p.venue ? `venue: ${p.venue}` : null,
    p.publishedDate ? `date: ${p.publishedDate}` : null,
    Number.isFinite(p.citationCount) ? `citations: ${p.citationCount}` : null,
    `abstract: ${p.abstract || '(no abstract available)'}`,
  ].filter(Boolean);
  return parts.join('\n');
};

// ---- Per-paper enrichment ----
export const PAPER_SCHEMA = {
  type: 'object',
  required: ['whatsNew', 'whyItMatters', 'summary', 'relevance'],
  properties: {
    whatsNew: { type: 'string' },
    whyItMatters: { type: 'string' },
    summary: { type: 'string' },
    relevance: { type: 'number', minimum: 0, maximum: 1 },
  },
};

export function paperPrompt(topic, p) {
  return [
    `Topic of interest: "${topic}"`,
    '',
    'Paper:',
    paperLine(p),
    '',
    'Produce a JSON object with:',
    '- whatsNew: 1-2 lines, the core new contribution (from the abstract).',
    '- whyItMatters: 1 line, why a practitioner working on this topic should care.',
    '- summary: 2-4 sentences, plain language, strictly from the abstract.',
    `- relevance: 0..1, how on-topic this paper is for "${topic}". Score loosely-related work low.`,
    '',
    GUARDRAIL,
  ].join('\n');
}

// ---- Clustering ----
export const CLUSTER_SCHEMA = {
  type: 'object',
  required: ['clusters'],
  properties: {
    clusters: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'synthesis', 'paperIds'],
        properties: {
          name: { type: 'string' },
          synthesis: { type: 'string' },
          paperIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

export function clusterPrompt(topic, papers) {
  const digest = papers.map((p) => `- ${p.id}: ${p.title} — ${p.whatsNew || p.summary || ''}`).join('\n');
  return [
    `Topic: "${topic}". Group these papers into 3-6 thematic clusters.`,
    '',
    digest,
    '',
    'Return JSON {clusters: [{name, synthesis, paperIds}]} where:',
    '- name: a short theme label.',
    '- synthesis: one line on what the cluster collectively shows.',
    '- paperIds: ids from the list above ONLY. Every paper should appear in at least one cluster.',
    '',
    'Use only ids that appear above — do not invent ids. ' + GUARDRAIL,
  ].join('\n');
}

// ---- Deep dive (full text) ----
export const DEEPDIVE_SCHEMA = {
  type: 'object',
  required: ['findings', 'method', 'limitations'],
  properties: {
    findings: { type: 'array', items: { type: 'string' } },
    method: { type: 'string' },
    limitations: { type: 'array', items: { type: 'string' } },
  },
};

export function deepDivePrompt(p, fullText, source) {
  const note = source === 'abstract'
    ? 'NOTE: only the abstract was available — do NOT state method details or limitations that are not in it; return empty arrays/strings where unknown.'
    : 'The following is the paper full text (possibly truncated).';
  return [
    `Paper: ${p.title}`,
    note,
    '',
    fullText,
    '',
    'Return JSON {findings: string[], method: string, limitations: string[]}:',
    '- findings: concrete, specific results stated in the text.',
    '- method: 1-2 lines on the approach.',
    '- limitations: stated (or clearly implied) limitations.',
    '',
    GUARDRAIL,
  ].join('\n');
}

// ---- Trending synthesis ----
export const TRENDING_SCHEMA = {
  type: 'object',
  required: ['trending'],
  properties: { trending: { type: 'string' } },
};

export function trendingPrompt(topic, clusters) {
  const lines = clusters.map((c) => `- ${c.name}: ${c.synthesis}`).join('\n');
  return [
    `Topic: "${topic}". Based on these cluster summaries, write 1-3 sentences on what is heating up.`,
    '',
    lines,
    '',
    'Return JSON {trending: string}. ' + GUARDRAIL,
  ].join('\n');
}
