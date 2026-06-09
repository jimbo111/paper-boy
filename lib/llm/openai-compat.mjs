// Generic OpenAI-compatible chat-completions adapter. The chat request/response
// shape lives only here; openai.mjs and deepseek.mjs are thin presets over it,
// and any other OpenAI-compatible server (Groq, Together, Ollama, vLLM,
// Gemini-compat) works by passing its baseUrl.

export function makeProvider({ name, defaultModel, defaultBase }) {
  return {
    name,
    defaultModel,

    buildRequest({ model, apiKey, baseUrl, system, prompt, schema, maxTokens = 4096 }) {
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });
      const body = { model, max_tokens: maxTokens, messages };
      // Best-effort structured output; some compatible servers reject this, so the
      // json.mjs repair ladder remains the real guarantee.
      if (schema) body.response_format = { type: 'json_object' };
      return {
        url: `${(baseUrl || defaultBase).replace(/\/$/, '')}/chat/completions`,
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body,
      };
    },

    parseResponse(res) {
      const choice = res && res.choices && res.choices[0];
      const finish = choice && choice.finish_reason;
      const text = (choice && choice.message && choice.message.content) || '';
      return { text, usage: res && res.usage, stopReason: finish };
    },
  };
}
