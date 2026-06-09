import anthropic from './anthropic.mjs';
import openai from './openai.mjs';
import deepseek from './deepseek.mjs';
import { makeProvider } from './openai-compat.mjs';

const REGISTRY = { anthropic, openai, deepseek };

// Resolve a provider adapter by name. `openai-compat` (or any unknown name when a
// baseUrl is given) yields a generic OpenAI-compatible adapter pointed at baseUrl —
// this is how Groq/Together/Ollama/vLLM/Gemini-compat backends are reached.
export function getProvider(name, { baseUrl } = {}) {
  if (REGISTRY[name]) return REGISTRY[name];
  if (name === 'openai-compat' || name === 'compatible' || name === 'custom') {
    if (!baseUrl) throw new Error(`provider "${name}" requires a baseUrl (--base-url or PAPER_BOY_BASE_URL)`);
    return makeProvider({ name, defaultModel: undefined, defaultBase: baseUrl });
  }
  throw new Error(`unknown provider "${name}" (expected: anthropic, openai, deepseek, openai-compat)`);
}

export const PROVIDERS = Object.keys(REGISTRY);
