/**
 * Provider client factory. Groq and custom endpoints share the
 * OpenAI-compatible adapter; the config's baseURL differentiates them.
 */
import type { AIProviderConfig, ProviderClient } from '../types';
import { AnthropicClient } from './anthropic';
import { GoogleClient } from './google';
import { OpenAICompatibleClient } from './openaiCompatible';

export function createProviderClient(config: AIProviderConfig): ProviderClient {
  switch (config.type) {
    case 'anthropic':
      return new AnthropicClient(config);
    case 'google':
      return new GoogleClient(config);
    case 'openai':
    case 'groq':
    case 'custom':
      return new OpenAICompatibleClient(config);
  }
}

export { AnthropicClient } from './anthropic';
export { GoogleClient } from './google';
export { OpenAICompatibleClient } from './openaiCompatible';
