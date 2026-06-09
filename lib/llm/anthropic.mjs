// Anthropic (Claude) adapter. Pure request-builder + response-parser; the network
// call lives in client.mjs so retry/rate-limit/repair are written once.

const DEFAULT_BASE = 'https://api.anthropic.com';

export default {
  name: 'anthropic',
  defaultModel: 'claude-opus-4-8',

  buildRequest({ model, apiKey, baseUrl, system, prompt, schema, maxTokens = 4096 }) {
    const body = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    };
    if (system) body.system = system;
    // Ask for JSON-shaped output when a schema is supplied. The repair ladder in
    // json.mjs is the safety net for servers/models that don't honour it.
    if (schema) body.output_config = { format: { type: 'json_schema', schema } };
    return {
      url: `${(baseUrl || DEFAULT_BASE).replace(/\/$/, '')}/v1/messages`,
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body,
    };
  },

  parseResponse(res) {
    const stopReason = res && res.stop_reason;
    if (stopReason === 'refusal') throw new Error('model refused to respond');
    const blocks = (res && res.content) || [];
    const text = blocks.filter((b) => b && b.type === 'text').map((b) => b.text).join('');
    return { text, usage: res && res.usage, stopReason };
  },
};
