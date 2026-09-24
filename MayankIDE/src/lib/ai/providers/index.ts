/**
 * Provider client factory. Groq and custom endpoints share the
 * OpenAI-compatible adapter by default; a custom endpoint's
 * `compatibility` mode can switch it to the Anthropic Messages or
 * OpenAI Responses wire protocol instead.
 */
import type { AIProviderConfig, ProviderClient } from '../types';
import { AnthropicClient } from './anthropic';
import { GoogleClient } from './google';
import { OpenAICompatibleClient } from './openaiCompatible';
import { OpenResponseClient } from './openResponse';

export function createProviderClient(config: AIProviderConfig): ProviderClient {
  switch (config.type) {
    case 'anthropic':
      return new AnthropicClient(config);
    case 'google':
      return new GoogleClient(config);
    case 'custom':
      switch (config.compatibility ?? 'openai') {
        case 'anthropic':
          return new AnthropicClient(config);
        case 'open-response':
          return new OpenResponseClient(config);
        default:
          return new OpenAICompatibleClient(config);
      }
    case 'openai':
    case 'groq':
      return new OpenAICompatibleClient(config);
  }
}

export { AnthropicClient } from './anthropic';
export { GoogleClient } from './google';
export { OpenAICompatibleClient } from './openaiCompatible';
export { OpenResponseClient } from './openResponse';