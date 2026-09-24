/**
 * AI provider abstraction — shared types (Phase 2).
 * See PRD §5.3. No `any` in this layer.
 */

export type ProviderType = 'openai' | 'anthropic' | 'google' | 'groq' | 'custom';

export interface AIModel {
  id: string;
  displayName?: string;
  contextWindow?: number;
}

/**
 * Persisted provider configuration (AsyncStorage).
 * NEVER contains the API key — keys live in the OS keychain
 * (src/lib/storage/keychain.ts) and are looked up by provider id.
 */
export type CompatibilityMode = 'openai' | 'anthropic' | 'open-response';

export interface AIProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  /** e.g. "https://api.openai.com/v1" or "http://192.168.1.50:11434/v1" */
  baseURL: string;
  /** Extra headers (auth proxies, etc.). May contain secrets by user's choice. */
  customHeaders?: Record<string, string>;
  /** Compatibility layer for custom endpoints (OpenAI / Anthropic / Generic). */
  compatibility?: CompatibilityMode;
  models: AIModel[];
  defaultModel?: string;
  createdAt: number;
  /** Set when "Test connection" last succeeded. */
  lastTestOkAt?: number;
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface StreamToken {
  type: 'text' | 'done' | 'error';
  text?: string;
  /** Human-readable, sanitized (never contains the API key). */
  error?: string;
}

export interface TestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

/**
 * A stateless provider client, built from a config. The API key is passed
 * per-call (fetched from keychain on demand) and never retained.
 */
export interface ProviderClient {
  readonly config: AIProviderConfig;
  /** Stream a chat completion. apiKey may be null for keyless local endpoints. */
  chat(request: ChatRequest, apiKey: string | null): AsyncGenerator<StreamToken>;
  listModels(apiKey: string | null): Promise<AIModel[]>;
  testConnection(apiKey: string | null): Promise<TestResult>;
}

/** Result of extracting text delta(s) from one SSE payload. */
export interface ExtractResult {
  texts: string[];
  error?: string;
  done?: boolean;
}
