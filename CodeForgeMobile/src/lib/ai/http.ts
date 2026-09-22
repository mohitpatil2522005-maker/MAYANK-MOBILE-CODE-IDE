/**
 * Small HTTP helpers for non-streaming calls (listModels, testConnection).
 * Pure runtime-agnostic code — fetch exists on RN (0.71+), web and Node 18+.
 */

/** Join a base URL and a path exactly once at the boundary. */
export function joinURL(baseURL: string, path: string): string {
  const base = baseURL.replace(/\/+$/, '');
  const suffix = path.replace(/^\/+/, '');
  return `${base}/${suffix}`;
}

/** Shorten an unknown error to a safe single-line message. */
export function messageFrom(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Truncate response text for error messages; never includes request data. */
export function snippet(text: string, max = 300): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

export interface FetchJsonOptions {
  headers?: Record<string, string>;
  body?: string;
  method?: string;
  timeoutMs?: number;
}

/**
 * fetch JSON with timeout. Throws Error("HTTP <status> — <snippet>") on
 * non-2xx. Non-JSON success bodies resolve to null.
 */
export async function fetchJson(url: string, options: FetchJsonOptions = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  try {
    const res = await fetch(url, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} — ${snippet(text)}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Context window sizes for well-known models (fallback when API omits it). */
const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-3.5-turbo': 16_385,
};

/** Best-effort context window by model id substring; undefined when unknown. */
export function guessContextWindow(modelId: string): number | undefined {
  const id = modelId.toLowerCase();
  for (const [key, value] of Object.entries(KNOWN_CONTEXT_WINDOWS)) {
    if (id.includes(key)) return value;
  }
  if (id.includes('claude')) return 200_000;
  if (id.includes('gemini-1.5') || id.includes('gemini-2')) return 1_000_000;
  if (id.includes('llama-3.3') || id.includes('llama-3.1')) return 128_000;
  return undefined;
}
