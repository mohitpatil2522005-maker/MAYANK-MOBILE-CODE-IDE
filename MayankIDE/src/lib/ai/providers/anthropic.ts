/**
 * Anthropic Messages API client (with SSE streaming).
 * System messages are lifted into the top-level `system` parameter and the
 * remaining history is mapped to user/assistant turns.
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

const ANTHROPIC_VERSION = '2023-06-01';

/** Pure: extract text deltas from one Anthropic SSE payload. Exported for tests. */
export function extractAnthropicDeltas(payload: string): ExtractResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { texts: [], error: `Malformed SSE payload: ${payload.slice(0, 120)}` };
  }
  const obj = parsed as {
    type?: string;
    delta?: { type?: string; text?: string };
    error?: { message?: string };
  };
  if (obj.type === 'error') {
    return { texts: [], error: obj.error?.message ?? 'Anthropic stream error' };
  }
  if (obj.type === 'message_stop') return { texts: [], done: true };
  if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta' && obj.delta.text) {
    return { texts: [obj.delta.text] };
  }
  return { texts: [] }; // message_start, content_block_start/stop, pings…
}

interface AnthropicModelsResponse {
  data?: { id: string; display_name?: string }[];
}

export class AnthropicClient implements ProviderClient {
  constructor(readonly config: AIProviderConfig) {}

  private headers(apiKey: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
      // Required for direct browser calls; harmless on native.
      'anthropic-dangerous-direct-browser-access': 'true',
      ...this.config.customHeaders,
    };
    if (apiKey) headers['x-api-key'] = apiKey;
    return headers;
  }

  async *chat(request: ChatRequest, apiKey: string | null): AsyncGenerator<StreamToken> {
    const system = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const messages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const body = JSON.stringify({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
      ...(system ? { system } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      messages,
    });

    try {
      const stream = streamSSE(joinURL(this.config.baseURL, 'messages'), {
        headers: this.headers(apiKey),
        body,
      });
      for await (const payload of stream) {
        const { texts, error, done } = extractAnthropicDeltas(payload);
        if (error) {
          yield { type: 'error', error };
          return;
        }
        for (const text of texts) yield { type: 'text', text };
        if (done) break;
      }
      yield { type: 'done' };
    } catch (err) {
      yield { type: 'error', error: messageFrom(err) };
    }
  }

  async listModels(apiKey: string | null) {
    const json = (await fetchJson(joinURL(this.config.baseURL, 'models'), {
      headers: this.headers(apiKey),
    })) as AnthropicModelsResponse | null;
    return (json?.data ?? [])
      .map((m) => ({
        id: m.id,
        displayName: m.display_name,
        contextWindow: guessContextWindow(m.id),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async testConnection(apiKey: string | null): Promise<TestResult> {
    const started = Date.now();
    if (!apiKey) return { ok: false, message: 'Anthropic requires an API key' };
    try {
      const models = await this.listModels(apiKey);
      return {
        ok: true,
        message: models.length > 0 ? `Connected — ${models.length} models available` : 'Connected',
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return { ok: false, message: messageFrom(err), latencyMs: Date.now() - started };
    }
  }
}
