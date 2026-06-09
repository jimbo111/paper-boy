import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderHtml } from '../lib/html.mjs';

const data = JSON.parse(readFileSync(new URL('../fixtures/papers.enriched.sample.json', import.meta.url)));
const tpl = readFileSync(new URL('../template/reader.html', import.meta.url), 'utf8');

test('renderHtml injects data and replaces the token', () => {
  const html = renderHtml(data, tpl);
  assert.ok(!html.includes('__PAPER_BOY_DATA__'), 'token replaced');
  assert.ok(html.includes(data.papers[0].title), 'paper title present in embedded data');
  assert.ok(html.includes('"bibtex"'), 'bibtex precomputed into the data');
});

test('embedded data is parseable and complete', () => {
  const html = renderHtml(data, tpl);
  const m = html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'data script block exists');
  const parsed = JSON.parse(m[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>'));
  assert.equal(parsed.papers.length, data.papers.length);
  assert.ok(parsed.papers.every((p) => typeof p.bibtex === 'string'));
});

test('stays self-contained — no external asset references', () => {
  const html = renderHtml(data, tpl);
  assert.ok(!/https?:\/\/(cdn|fonts|unpkg|jsdelivr|cdnjs)/i.test(html), 'no CDN/web-font assets');
});

test('template uses event delegation + url sanitizer (no fragile inline handlers)', () => {
  assert.ok(tpl.includes('function safeUrl'), 'safeUrl scheme guard present');
  assert.ok(tpl.includes('data-act="open"'), 'delegation data-attributes present');
  assert.ok(!/onclick="(openPaper|selectPaper|toggleCluster|copyBib|toggleRead)/.test(tpl),
    'no value-interpolated inline handlers (breakable by quotes/backslashes in ids/cluster names)');
});

test('cluster names and ids with quotes survive injection into the data block', () => {
  const d = JSON.parse(JSON.stringify(data));
  d.clusters[0].name = "Models' Robustness & \\Backslash";
  d.papers[0].id = "doi:10.1/o'brien";
  const html = renderHtml(d, tpl);
  const m = html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/);
  const parsed = JSON.parse(m[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>'));
  assert.equal(parsed.clusters[0].name, "Models' Robustness & \\Backslash");
  assert.equal(parsed.papers[0].id, "doi:10.1/o'brien");
});

test('a stray closing script tag in data cannot break out', () => {
  const evil = JSON.parse(JSON.stringify(data));
  evil.papers[0].title = 'Pwn </script><script>alert(1)</script>';
  const html = renderHtml(evil, tpl);
  assert.ok(!html.includes('</script><script>alert(1)'), 'closing tag neutralised');
});

const reportFrom = (html) => {
  const m = html.match(/<script id="report-md" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'report-md block exists');
  return JSON.parse(m[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>'));
};

test('reader surfaces the per-paper summary (detail section + card preview)', () => {
  assert.ok(tpl.includes('>Summary</span>'), 'reader detail renders a Summary section');
  assert.ok(tpl.includes('p.summary || p.whatsNew'), 'cards prefer the summary as their preview');
  const html = renderHtml(data, tpl);
  assert.ok(html.includes('confines low-rank adapters to the cross-attention layers'), 'summary text embedded in data');
});

test('embeds the editorial typeface inline — no web-font fetch', () => {
  const html = renderHtml(data, tpl);
  assert.ok(!html.includes('__PAPER_BOY_FONTS__'), 'font token replaced');
  assert.ok(html.includes('@font-face'), '@font-face declared');
  assert.ok(html.includes('data:font/woff2;base64,'), 'font inlined as base64 data URL');
  assert.ok(!/fonts\.(googleapis|gstatic)\.com/i.test(html), 'no Google Fonts request leaks in');
});

test('interactive cards / list items / chips are real buttons (keyboard + a11y)', () => {
  assert.ok(/<button type="button" class="entry /.test(tpl), 'front-page entries are buttons');
  assert.ok(/<button type="button" class="ritem /.test(tpl), 'reader list items are buttons');
  assert.ok(/<button type="button" class="chip"/.test(tpl), 'filter chips are buttons');
  assert.ok(tpl.includes('aria-pressed'), 'chips/toggles expose pressed state');
});

test('embeds the markdown report and round-trips it byte-for-byte', () => {
  const md = "# Title\n\nLine with $cash, a quote ' and unicode ✓ — ok.";
  const html = renderHtml(data, tpl, md);
  assert.ok(!html.includes('__PAPER_BOY_REPORT_MD__'), 'report token replaced');
  assert.equal(reportFrom(html), md);
});

test('markdown defaults to empty string when omitted', () => {
  const html = renderHtml(data, tpl);
  assert.ok(!html.includes('__PAPER_BOY_REPORT_MD__'), 'token replaced even with no markdown');
  assert.equal(reportFrom(html), '');
});

test('a closing script tag inside the markdown cannot break out', () => {
  const md = 'evil </script><script>alert(1)</script> still markdown';
  const html = renderHtml(data, tpl, md);
  assert.ok(!html.includes('</script><script>alert(1)'), 'closing tag neutralised in report block');
  assert.equal(reportFrom(html), md, 'still recovers the exact markdown');
});
