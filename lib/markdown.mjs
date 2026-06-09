const primaryLink = (p) =>
  p.links?.arxiv || p.links?.doi || p.links?.pdf || p.links?.landing || null;

const linkLine = (p) => {
  const parts = [];
  if (p.links?.pdf) parts.push(`[PDF](${p.links.pdf})`);
  if (p.links?.arxiv) parts.push(`[arXiv](${p.links.arxiv})`);
  if (p.links?.doi) parts.push(`[DOI](${p.links.doi})`);
  if (p.links?.landing) parts.push(`[Page](${p.links.landing})`);
  return parts.join(' · ');
};

const titleMd = (p) => {
  const link = primaryLink(p);
  const star = p.mustRead ? ' ⭐' : '';
  return link ? `[${p.title}](${link})${star}` : `${p.title}${star}`;
};

function paperBlock(p) {
  const meta = [
    p.authors?.length ? p.authors.slice(0, 4).join(', ') + (p.authors.length > 4 ? ' et al.' : '') : null,
    p.publishedDate,
    p.venue,
    Number.isFinite(p.citationCount) ? `${p.citationCount} citations` : null,
    p.sources?.length ? `via ${p.sources.join('/')}` : null,
  ].filter(Boolean).join(' · ');

  const lines = [`### ${titleMd(p)}`, `*${meta}*`, ''];
  if (p.summary) lines.push(p.summary, '');
  if (p.whatsNew) lines.push(`**What's new:** ${p.whatsNew}`, '');
  if (p.tldr) lines.push(`**TL;DR:** ${p.tldr}`, '');
  if (p.whyItMatters) lines.push(`**Why it matters:** ${p.whyItMatters}`, '');
  if (p.deepDive && p.deepDive.fullText === 'read') {
    if (p.deepDive.findings?.length) {
      lines.push('**Key findings:**');
      for (const f of p.deepDive.findings) lines.push(`- ${f}`);
      lines.push('');
    }
    if (p.deepDive.method) lines.push(`**Method:** ${p.deepDive.method}`, '');
    if (p.deepDive.limitations?.length) {
      lines.push(`**Limitations:** ${p.deepDive.limitations.join('; ')}`, '');
    }
  }
  const links = linkLine(p);
  if (links) lines.push(`🔗 ${links}`, '');
  return lines.join('\n');
}

export function renderMarkdown(enriched) {
  const { meta = {}, clusters = [], startHere = [], papers = [] } = enriched;
  const byId = new Map(papers.map((p) => [p.id, p]));
  const out = [];

  out.push(`# 📰 paper-boy: ${meta.topic || 'research'}`, '');
  const src = meta.sources || {};
  out.push(
    `**Window:** since ${meta.since || 'n/a'} · **Generated:** ${meta.generatedAt || ''} · ` +
    `**Sources:** arXiv ${src.arxiv ?? 0} · S2 ${src.s2 ?? 0} · OpenAlex ${src.openalex ?? 0} · ` +
    `**${papers.length} papers**`,
    '',
  );

  if (enriched.trending) out.push('## What\'s trending', '', enriched.trending, '');

  if (startHere.length) {
    out.push('## Start here', '');
    startHere.forEach((id, i) => {
      const p = byId.get(id);
      if (!p) return;
      const blurb = p.whatsNew || p.tldr || '';
      out.push(`${i + 1}. **${titleMd(p)}** — ${blurb} _(${p.publishedDate || 'n.d.'} · ${p.citationCount ?? 0} cites)_`);
    });
    out.push('');
  }

  const seen = new Set();
  for (const c of clusters) {
    out.push(`## ${c.name}`, '');
    if (c.synthesis) out.push(`_${c.synthesis}_`, '');
    for (const id of c.paperIds || []) {
      const p = byId.get(id);
      if (!p) continue;
      seen.add(id);
      out.push(paperBlock(p), '---', '');
    }
  }

  const orphans = papers.filter((p) => !seen.has(p.id));
  if (orphans.length) {
    out.push('## More results', '');
    for (const p of orphans) out.push(paperBlock(p), '---', '');
  }

  out.push('## Sources', '');
  out.push(
    `${papers.length} papers from arXiv (${src.arxiv ?? 0}), ` +
    `Semantic Scholar (${src.s2 ?? 0}), OpenAlex (${src.openalex ?? 0}). ` +
    'Every title, link, date, and citation count is from a real source — no fabrication.',
    '',
    `_Compiled by paper-boy on ${meta.generatedAt || ''}._`,
  );
  return out.join('\n');
}
