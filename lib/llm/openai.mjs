import { makeProvider } from './openai-compat.mjs';

export default makeProvider({
  name: 'openai',
  defaultModel: 'gpt-4o',
  defaultBase: 'https://api.openai.com/v1',
  // OpenAI's newer models (o-series, gpt-5 family) reject `max_tokens`;
  // `max_completion_tokens` works across current OpenAI chat models.
  tokenParam: 'max_completion_tokens',
});
