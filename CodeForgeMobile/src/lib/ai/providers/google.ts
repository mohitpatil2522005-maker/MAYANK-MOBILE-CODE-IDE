/**
 * Google Gemini API client (streamGenerateContent with alt=sse).
 * System messages map to `systemInstruction`; assistant turns become "model".
 * The key is sent via the x-goog-api-key header (never in the URL).
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

/** Pure: extract text deltas from one Gemini SSE payload. Exported for tests. */
export function extractGeminiDeltas(payload: string): ExtractResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { texts: [], error: `Malformed SSE payload: ${payload.slice(0, 120)}` };
  }
  const obj = parsed as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  if (obj.error?.message) return { texts: [], error: obj.error.message };
  if (obj.promptFeedback?.blockReason) {
    return { texts: [], error: `Blocked by safety filter (${obj.promptFeedback.blockReason})` };
  }
  const texts: string[] = [];
  for (const candidate of obj.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (typeof part.text === 'string' && part.text.length > 0) texts.push(part.text);
    }
  }
  return { texts };
}

interface GeminiModelsResponse {
  models?: { name: string; displayName?: string }[];
}

export class GoogleClient implements ProviderClient {
  constructor(readonly config: AIProviderConfig) {}

  private headers(apiKey: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.customHeaders,
    };
    if (apiKey) headers['x-goog-api-key'] = apiKey;
    return headers;
  }

  async *chat(request: ChatRequest, apiKey: string | null): AsyncGenerator<StreamToken> {
    if (!apiKey) {
      yield { type: 'error', error: 'Google Gemini requires an API key' };
      return;
    }
    const system = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const body = JSON.stringify({
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
      },
    });

    try {
      const stream = streamSSE(
        joinURL(this.config.baseURL, `models/${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse`),
        { headers: this.headers(apiKey), body },
      );
      for await (const payload of stream) {
        const { texts, error } = extractGeminiDeltas(payload);
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
    if (!apiKey) throw new Error('Google Gemini requires an API key');
    const json = (await fetchJson(joinURL(this.config.baseURL, 'models'), {
      headers: this.headers(apiKey),
    })) as GeminiModelsResponse | null;
    return (json?.models ?? [])
      .map((m) => {
        const id = m.name.replace(/^models\//, '');
        return { id, displayName: m.displayName, contextWindow: guessContextWindow(id) };
      })
      .filter((m) => m.id.startsWith('gemini'))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async testConnection(apiKey: string | null): Promise<TestResult> {
    const started = Date.now();
    if (!apiKey) return { ok: false, message: 'Google Gemini requires an API key' };
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
