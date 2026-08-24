const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UA = 'paper-boy/0.1 (+https://github.com/jimbo111/paper-boy)';

async function request(url, { timeout = 15000, retries = 3, baseDelay = 500,
                              headers = {}, fetchImpl = fetch, parse = 'json',
                              method = 'GET', body, signal } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    // Abort if the caller's signal fires (e.g. a run-wide cancellation).
    const onAbort = () => ctrl.abort();
    if (signal) {
      if (signal.aborted) ctrl.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    // The deadline stays armed until the BODY is fully read, not just the headers —
    // a server that sends headers then stalls the stream must abort, not hang the run.
    const done = () => { clearTimeout(t); if (signal) signal.removeEventListener('abort', onAbort); };
    try {
      // Identify ourselves politely (arXiv's API terms ask for a descriptive agent).
      const init = { method, headers: { 'user-agent': UA, ...headers }, signal: ctrl.signal };
      if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
      const res = await fetchImpl(url, init);

      if (parse === 'raw') {
        // Always resolve the response so callers can branch on status (401 vs 429)
        // and read Retry-After. Only retry the transient classes below.
        if (!res.ok && (res.status === 429 || res.status >= 500) && attempt < retries) {
          done();
          await sleep(retryDelay(res, baseDelay, attempt));
          continue;
        }
        const text = await res.text();
        done();
        return { ok: res.ok, status: res.status, headers: res.headers, body: text };
      }

      if (res.ok) {
        const out = parse === 'text' ? await res.text() : await res.json();
        done();
        return out;
      }
      done();
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) { await sleep(retryDelay(res, baseDelay, attempt)); continue; }
      }
      return null;
    } catch (err) {
      clearTimeout(t);
      if (signal) signal.removeEventListener('abort', onAbort);
      // A caller-initiated abort is terminal — don't burn retries on it.
      if (signal && signal.aborted) return parse === 'raw' ? { ok: false, status: 0, aborted: true } : null;
      if (attempt < retries) { await sleep(baseDelay * 2 ** attempt); continue; }
      return parse === 'raw' ? { ok: false, status: 0, error: String(err && err.message || err) } : null;
    }
  }
  return parse === 'raw' ? { ok: false, status: 0 } : null;
}

// Honour a server-sent Retry-After (seconds) when present, else exponential backoff.
function retryDelay(res, baseDelay, attempt) {
  const ra = res.headers && res.headers.get && res.headers.get('retry-after');
  const secs = ra ? Number(ra) : NaN;
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 60000);
  return baseDelay * 2 ** attempt;
}

export const getJSON = (url, opts = {}) => request(url, { ...opts, parse: 'json' });
export const getText = (url, opts = {}) => request(url, { ...opts, parse: 'text' });

// POST returning the full {ok,status,headers,body} wrapper so the LLM client can
// distinguish auth (401) from rate-limit (429) and read Retry-After. `body` is
// JSON-stringified unless already a string; Content-Type defaults to JSON.
export const postRaw = (url, opts = {}) => request(url, {
  ...opts,
  method: 'POST',
  parse: 'raw',
  headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
});
