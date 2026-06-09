import { makeProvider } from './openai-compat.mjs';

export default makeProvider({
  name: 'openai',
  defaultModel: 'gpt-4o',
  defaultBase: 'https://api.openai.com/v1',
});
