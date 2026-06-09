import { postRaw } from '../http.mjs';
import { tryExtractJson } from './json.mjs';

// Minimal token-bucket rate limiter: at most `rps` starts per second AND at most
// `maxConcurrency` in flight. Shared across every call made through one client.
function makeLimiter({ rps = 2, maxConcurrency = 4 } = {}) {
  let inFlight = 0;
  let last = 0;
  const queue = [];
  const minGap = rps > 0 ? 1000 / rps : 0;
  const pump = () => {
    if (!queue.length || inFlight >= maxConcurrency) return;
    const now = Date.now();
    const wait = Math.max(0, last + minGap - now);
    setTimeout(() => {
      if (!queue.length || inFlight >= maxConcurrency) return;
      const job = queue.shift();
      inFlight++;
      last = Date.now();
      job.run().then(job.resolve, job.reject).finally(() => { inFlight--; pump(); });
      pump();
    }, wait);
  };
  return (run) => new Promise((resolve, reject) => { queue.push({ run, resolve, reject }); pump(); });
}

// Build a completion client bound to a provider + config. `postImpl` is injectable
// for tests (defaults to the real POST transport). Never throws — every call
// resolves to {ok, data?, raw, error?} so one bad paper can't abort a batch.
export function makeClient({ provider, model, apiKey, baseUrl, rps, maxConcurrency,
                             maxRepairRetries = 2, postImpl = postRaw } = {}) {
  const limit = makeLimiter({ rps, maxConcurrency });
  const useModel = model || provider.defaultModel;

  async function once({ system, prompt, schema, signal, maxTokens }) {
    const req = provider.buildRequest({ model: useModel, apiKey, baseUrl, system, prompt, schema, maxTokens });
    const res = await postImpl(req.url, { headers: req.headers, body: req.body, signal });
    if (!res || !res.ok) {
      const status = res ? res.status : 0;
      const msg = status === 401 || status === 403 ? 'authentication failed (check API key)'
        : status === 429 ? 'rate limited'
          : status === 0 ? (res && res.aborted ? 'aborted' : 'network error')
            : `provider returned HTTP ${status}`;
      return { ok: false, status, error: msg, raw: res && res.body };
    }
    let parsedBody;
    try { parsedBody = JSON.parse(res.body); }
    catch { return { ok: false, status: res.status, error: 'provider returned non-JSON envelope', raw: res.body }; }
    let text;
    try { ({ text } = provider.parseResponse(parsedBody)); }
    catch (err) { return { ok: false, status: res.status, error: String(err.message || err), raw: res.body }; }
    return { ok: true, text, raw: res.body };
  }

  // Get a JSON value from the model, repairing/re-prompting on malformed output.
  async function complete({ system, prompt, schema, signal, maxTokens } = {}) {
    return limit(async () => {
      let lastErr = 'unknown';
      let lastText;
      for (let attempt = 0; attempt <= maxRepairRetries; attempt++) {
        if (signal && signal.aborted) return { ok: false, error: 'aborted' };
        // On a retry, hand the model its own bad output and demand clean JSON.
        const p = attempt === 0 ? prompt
          : `${prompt}\n\nYour previous reply could not be parsed as JSON:\n${truncate(lastText, 1500)}\n\nReturn ONLY valid JSON. No prose, no code fences.`;
        const r = await once({ system, prompt: p, schema, signal, maxTokens });
        if (!r.ok) {
          // Transport/auth errors are not fixable by re-prompting — stop.
          return { ok: false, error: r.error, status: r.status, raw: r.raw };
        }
        lastText = r.text;
        if (schema === undefined) return { ok: true, data: r.text, raw: r.raw };
        const j = tryExtractJson(r.text);
        if (j.ok) return { ok: true, data: j.value, raw: r.raw };
        lastErr = j.error;
      }
      return { ok: false, error: `unparseable JSON after ${maxRepairRetries + 1} attempts: ${lastErr}`, raw: lastText };
    });
  }

  return { complete, model: useModel };
}

const truncate = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n) + '…' : (s || ''));
