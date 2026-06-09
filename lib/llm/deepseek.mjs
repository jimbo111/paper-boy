import { makeProvider } from './openai-compat.mjs';

export default makeProvider({
  name: 'deepseek',
  defaultModel: 'deepseek-chat',
  defaultBase: 'https://api.deepseek.com/v1',
});
