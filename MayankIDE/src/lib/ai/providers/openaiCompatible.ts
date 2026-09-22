/**
 * OpenAI Chat Completions client — also serves Groq and any
 * OpenAI-compatible custom endpoint (Ollama, LM Studio, vLLM, …).
 */
import { fetchJson, guessContextWindow, joinURL, messageFrom } from '../http';
import { streamSSE } from '../streaming';
import type {
  AIProviderConfig,
  ChatRequest,
  ExtractResult,
  ProviderClient,
  StreamToken,
  TestResult,
} from '../types';

/** Pure: extract text deltas from one OpenAI SSE payload. Exported for tests. */
export function extractOpenAIDeltas(payload: string): ExtractResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { texts: [], error: `Malformed SSE payload: ${payload.slice(0, 120)}` };
  }
  const obj = parsed as {
    error?: { message?: string };
    choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
  };
  if (obj.error?.message) return { texts: [], error: obj.error.message };
  const texts: string[] = [];
  for (const choice of obj.choices ?? []) {
    const content = choice.delta?.content;
    if (typeof content === 'string' && content.length > 0) texts.push(content);
  }
  return { texts };
}

interface OpenAIModelsResponse {
  data?: { id: string }[];
}

export class OpenAICompatibleClient implements ProviderClient {
  constructor(readonly config: AIProviderConfig) {}

  private headers(apiKey: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.customHeaders,
    };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    return headers;
  }

  async *chat(request: ChatRequest, apiKey: string | null): AsyncGenerator<StreamToken> {
    const body = JSON.stringify({
      model: request.model,
      messages: request.messages,
      stream: true,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
    });

    try {
      const stream = streamSSE(joinURL(this.config.baseURL, 'chat/completions'), {
        headers: this.headers(apiKey),
        body,
      });
      for await (const payload of stream) {
        if (payload === '[DONE]') break;
        const { texts, error } = extractOpenAIDeltas(payload);
        if (error) {
          yield { type: 'error', error };
          return;
        }
        for (const text of texts) yield { type: 'text', text };
      }
      yield { type: 'done' };
    } catch (err) {
      yield { type: 'error', error: messageFrom(err) };
    }
  }

  async listModels(apiKey: string | null) {
    const json = (await fetchJson(joinURL(this.config.baseURL, 'models'), {
      headers: this.headers(apiKey),
    })) as OpenAIModelsResponse | null;
    const items = json?.data ?? [];
    return items
      .map((m) => ({ id: m.id, contextWindow: guessContextWindow(m.id) }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async testConnection(apiKey: string | null): Promise<TestResult> {
    const started = Date.now();
    try {
      const models = await this.listModels(apiKey);
      return {
        ok: true,
        message:
          models.length > 0
            ? `Connected — ${models.length} model${models.length === 1 ? '' : 's'} available`
            : 'Connected',
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return { ok: false, message: messageFrom(err), latencyMs: Date.now() - started };
    }
  }
}
