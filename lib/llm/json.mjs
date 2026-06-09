// Pull a JSON value out of a model's text response. Models wrap JSON in prose,
// code fences, or emit minor syntax slips — this repairs the common cases without
// any dependency. Returns the parsed value or throws if unrecoverable.

// Strip ```json ... ``` (or bare ```) fences.
function stripFences(s) {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1] : s;
}

// Scan for the first balanced {...} or [...] block, ignoring braces inside strings.
// Handles surrounding prose like "Here is the result: { ... }. Hope that helps."
function extractBalanced(s) {
  const start = s.search(/[{[]/);
  if (start === -1) return null;
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}

// Conservative fixups: smart quotes → straight, strip trailing commas, drop // line comments.
function lightFix(s) {
  return s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1');
}

const tryParse = (s) => { try { return { ok: true, value: JSON.parse(s) }; } catch { return { ok: false }; } };

// Repair ladder, cheapest first. Throws if nothing parses.
export function extractJson(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('empty model response');

  let direct = tryParse(text);
  if (direct.ok) return direct.value;

  const defenced = stripFences(text);
  direct = tryParse(defenced.trim());
  if (direct.ok) return direct.value;

  const balanced = extractBalanced(defenced) || extractBalanced(text);
  if (balanced) {
    const b = tryParse(balanced);
    if (b.ok) return b.value;
    const fixed = tryParse(lightFix(balanced));
    if (fixed.ok) return fixed.value;
  }

  const wholeFixed = tryParse(lightFix(defenced));
  if (wholeFixed.ok) return wholeFixed.value;

  throw new Error('could not parse JSON from model response');
}

// Soft variant: returns {ok, value} | {ok:false, error} instead of throwing.
export function tryExtractJson(text) {
  try { return { ok: true, value: extractJson(text) }; }
  catch (err) { return { ok: false, error: String(err.message || err) }; }
}
