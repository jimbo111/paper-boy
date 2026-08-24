import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBibtex } from '../lib/bibtex.mjs';

test('citekey surname uses the LAST token for "First Last" names (arXiv/OpenAlex/S2 form)', () => {
  assert.match(toBibtex({ authors: ['Mina Park'], year: 2026, title: 'Deep Vision' }), /@article\{park2026deep,/);
  assert.match(toBibtex({ authors: ['P. Müller'], year: 2026, title: 'Robust VLMs' }), /@article\{mller2026robust,/);
});

test('citekey still handles the "Last, First" comma form', () => {
  assert.match(toBibtex({ authors: ['Chen, Lei'], year: 2026, title: 'Deep Vision' }), /@article\{chen2026deep,/);
});

test('core fields render with author "and" joining', () => {
  const bib = toBibtex({ title: 'Deep Vision', authors: ['Lei Chen', 'Ravi Patel'], year: 2026, venue: 'NeurIPS', doi: '10.1/x', arxivId: '2401.1' });
  assert.match(bib, /title=\{Deep Vision\}/);
  assert.match(bib, /author=\{Lei Chen and Ravi Patel\}/);
  assert.match(bib, /year=\{2026\}/);
  assert.match(bib, /doi=\{10\.1\/x\}/);
});

test('BibTeX special characters in fields are escaped', () => {
  const bib = toBibtex({ authors: ['A. Smith'], year: 2026, title: 'Cost & Scale: 100% of $X #wins {ok}', venue: 'C_S' });
  assert.match(bib, /title=\{Cost \\& Scale: 100\\% of \\\$X \\#wins \\\{ok\\\}\}/);
  assert.match(bib, /journal=\{C\\_S\}/);
});

test('tolerates missing fields', () => {
  const bib = toBibtex({ title: 'Lonely Paper', authors: [], year: null });
  assert.match(bib, /@article\{anonndlonely,/);
  assert.match(bib, /title=\{Lonely Paper\}/);
});

test('colliding citekeys are disambiguated when a shared usedKeys set is passed', () => {
  const a = { authors: ['Wei Chen'], year: 2026, title: 'Efficient Adapters for VLMs' };
  const b = { authors: ['Li Chen'], year: 2026, title: 'Efficient Prompt Tuning' };
  const used = new Set();
  const ka = toBibtex(a, used).match(/^@article\{([^,]+),/)[1];
  const kb = toBibtex(b, used).match(/^@article\{([^,]+),/)[1];
  assert.equal(ka, 'chen2026efficient');
  assert.equal(kb, 'chen2026efficientb');
  assert.notEqual(ka, kb);
});
