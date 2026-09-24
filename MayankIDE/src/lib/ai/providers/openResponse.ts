/**
 * OpenAI Responses API client (`POST {baseURL}/responses` with SSE).
 * Used for custom endpoints whose compatibility mode is "Open Response".
 * System messages are lifted into the top-level `instructions` parameter;
 * the remaining history becomes the `input` array.
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

/** Pure: extract text deltas from one Responses-API SSE payload. Exported for tests. */
export function extractOpenResponseDeltas(payload: string): ExtractResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { texts: [], error: `Malformed SSE payload: ${payload.slice(0, 120)}` };
  }
  const obj = parsed as {
    type?: string;
    delta?: string;
    message?: string;
    response?: { error?: { message?: string } };
    // Lenient fallback: some proxies re-wrap Chat Completions chunks.
    choices?: { delta?: { content?: string } }[];
    error?: { message?: string };
  };
  if (obj.type === 'error') {
    return { texts: [], error: obj.message ?? 'Responses stream error' };
  }
  if (obj.type === 'response.failed') {
    return { texts: [], error: obj.response?.error?.message ?? 'Response failed' };
  }
  if (obj.error?.message) return { texts: [], error: obj.error.message };
  if (obj.type === 'response.completed' || obj.type === 'response.done') {
    return { texts: [], done: true };
  }
  if (obj.type === 'response.output_text.delta' && typeof obj.delta === 'string' && obj.delta) {
    return { texts: [obj.delta] };
  }
  // Lenient fallback for chat-completions-shaped chunks.
  const texts: string[] = [];
  for (const choice of obj.choices ?? []) {
    const content = choice.delta?.content;
    if (typeof content === 'string' && content.length > 0) texts.push(content);
  }
  return { texts }; // response.created, output_item.added, pings…
}

interface OpenAIModelsResponse {
  data?: { id: string }[];
}

export class OpenResponseClient implements ProviderClient {
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
    const instructions = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const input = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const body = JSON.stringify({
      model: request.model,
      input,
      stream: true,
      ...(instructions ? { instructions } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { max_output_tokens: request.maxTokens } : {}),
    });

    try {
      const stream = streamSSE(joinURL(this.config.baseURL, 'responses'), {
        headers: this.headers(apiKey),
        body,
      });
      for await (const payload of stream) {
        if (payload === '[DONE]') break;
        const { texts, error, done } = extractOpenResponseDeltas(payload);
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
