/**
 * Built-in provider presets for the Phase 4 "Add Provider" flow.
 * Model lists are editable starting points — `/models` auto-fetch refines them.
 */
import type { AIModel, ProviderType } from './types';

export interface ProviderPreset {
  type: ProviderType;
  label: string;
  defaultBaseURL: string;
  requiresKey: boolean;
  keyHint?: string;
  defaultModels: AIModel[];
}

export const PROVIDER_PRESETS: Record<ProviderType, ProviderPreset> = {
  openai: {
    type: 'openai',
    label: 'OpenAI',
    defaultBaseURL: 'https://api.openai.com/v1',
    requiresKey: true,
    keyHint: 'sk-…',
    defaultModels: [
      { id: 'gpt-4o', displayName: 'GPT-4o', contextWindow: 128_000 },
      { id: 'gpt-4o-mini', displayName: 'GPT-4o mini', contextWindow: 128_000 },
      { id: 'gpt-4-turbo', displayName: 'GPT-4 Turbo', contextWindow: 128_000 },
    ],
  },
  anthropic: {
    type: 'anthropic',
    label: 'Anthropic',
    defaultBaseURL: 'https://api.anthropic.com/v1',
    requiresKey: true,
    keyHint: 'sk-ant-…',
    defaultModels: [
      { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', contextWindow: 200_000 },
      { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', contextWindow: 200_000 },
      { id: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', contextWindow: 200_000 },
    ],
  },
  google: {
    type: 'google',
    label: 'Google Gemini',
    defaultBaseURL: 'https://generativelanguage.googleapis.com/v1beta',
    requiresKey: true,
    keyHint: 'AIza…',
    defaultModels: [
      { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', contextWindow: 1_000_000 },
      { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', contextWindow: 2_000_000 },
      { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', contextWindow: 1_000_000 },
    ],
  },
  groq: {
    type: 'groq',
    label: 'Groq',
    defaultBaseURL: 'https://api.groq.com/openai/v1',
    requiresKey: true,
    keyHint: 'gsk_…',
    defaultModels: [
      { id: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B', contextWindow: 128_000 },
      { id: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B', contextWindow: 128_000 },
      { id: 'mixtral-8x7b-32768', displayName: 'Mixtral 8x7B', contextWindow: 32_768 },
    ],
  },
  custom: {
    type: 'custom',
    label: 'Custom endpoint',
    defaultBaseURL: 'http://localhost:11434/v1',
    requiresKey: false,
    keyHint: 'Optional (Ollama, LM Studio, vLLM…)',
    defaultModels: [],
  },
};

/** Show "http" endpoints only after an explicit user opt-in (PRD §6). */
export function isInsecureEndpoint(baseURL: string): boolean {
  return baseURL.trim().toLowerCase().startsWith('http://');
}
