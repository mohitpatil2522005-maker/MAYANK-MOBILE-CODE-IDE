/**
 * SSE (Server-Sent Events) utilities.
 *
 * `SSEParser` is a pure, testable buffer → events state machine.
 * `streamSSE` is the transport: it uses XMLHttpRequest.onprogress because
 * React Native's fetch buffers the entire response body (no ReadableStream),
 * while XHR delivers incremental text — and XHR also works in browsers.
 */

export interface SSEOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Incremental parser for text/event-stream. Feed raw text via push();
 * it returns completed `data:` payloads (multi-line data joined with \n).
 * The literal payload "[DONE]" is surfaced like any other payload —
 * callers/producers decide what to do with it.
 */
export class SSEParser {
  private buffer = '';
  private dataLines: string[] = [];

  push(chunk: string): string[] {
    this.buffer += chunk;
    const events: string[] = [];
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? ''; // last piece may be incomplete

    for (const line of lines) {
      if (line === '') {
        // blank line = event boundary
        if (this.dataLines.length > 0) {
          events.push(this.dataLines.join('\n'));
          this.dataLines = [];
        }
        continue;
      }
      if (line.startsWith(':')) continue; // comment / heartbeat
      if (line.startsWith('data:')) {
        this.dataLines.push(line.slice(5).replace(/^ /, ''));
      }
      // ignore event:, id:, retry: — providers only need data
    }
    return events;
  }

  /** Flush at end-of-stream: emit any pending unterminated event. */
  end(): string[] {
    const events: string[] = [];
    if (this.buffer.startsWith('data:')) {
      this.dataLines.push(this.buffer.slice(5).replace(/^ /, ''));
    }
    if (this.dataLines.length > 0) {
      events.push(this.dataLines.join('\n'));
    }
    this.buffer = '';
    this.dataLines = [];
    return events;
  }
}

/** Simple producer/consumer queue bridging XHR callbacks to a generator. */
class AsyncQueue {
  private items: ({ text: string } | { error: Error } | { done: true })[] = [];
  private waiters: ((item: { text?: string; error?: Error; done?: true }) => void)[] = [];

  pushText(text: string): void {
    this.push({ text });
  }
  pushError(error: Error): void {
    this.push({ error });
  }
  pushDone(): void {
    this.push({ done: true });
  }

  private push(item: { text: string } | { error: Error } | { done: true }): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(item);
    else this.items.push(item);
  }

  next(): Promise<{ text?: string; error?: Error; done?: true }> {
    const item = this.items.shift();
    if (item) return Promise.resolve(item);
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

function hostOf(url: string): string {
  const match = /^[a-z]+:\/\/([^/]+)/i.exec(url);
  return match ? match[1] : url;
}

/** Truncate + strip anything that looks like a bearer/key fragment. */
function sanitizeSnippet(text: string, max = 400): string {
  return text
    .replace(/(bearer\s+)[a-z0-9._-]+/gi, '$1•••')
    .replace(/(sk-[a-z0-9_-]{4})[a-z0-9_-]+/gi, '$1•••')
    .slice(0, max);
}

/**
 * Stream an SSE endpoint. Yields raw `data:` payloads (JSON strings or
 * "[DONE]"). Returning early from the generator aborts the request.
 *
 * HTTP errors throw an Error whose message includes a sanitized response
 * snippet — request bodies are never included, headers never logged.
 */
export async function* streamSSE(url: string, options: SSEOptions): AsyncGenerator<string> {
  const XHR = (globalThis as { XMLHttpRequest?: typeof XMLHttpRequest }).XMLHttpRequest;
  if (!XHR) {
    throw new Error('SSE transport unavailable: XMLHttpRequest is not present on this platform');
  }

  const queue = new AsyncQueue();
  const xhr = new XHR();
  let cursor = 0;
  let httpStatus = 0;
  let failedBody: string | null = null;

  xhr.onprogress = () => {
    httpStatus = xhr.status;
    const full = xhr.responseText as string;
    if (httpStatus >= 400) return; // drain via onload; error body fully read there
    if (full.length > cursor) {
      queue.pushText(full.slice(cursor));
      cursor = full.length;
    }
  };
  xhr.onload = () => {
    if (xhr.status >= 400) {
      failedBody = sanitizeSnippet(String(xhr.responseText ?? ''));
      queue.pushError(new Error(`HTTP ${xhr.status} from ${hostOf(url)} — ${failedBody}`));
      return;
    }
    const full = xhr.responseText as string;
    if (full.length > cursor) queue.pushText(full.slice(cursor));
    queue.pushDone();
  };
  xhr.onerror = () => queue.pushError(new Error(`Network error contacting ${hostOf(url)}`));
  xhr.ontimeout = () => queue.pushError(new Error(`Request to ${hostOf(url)} timed out`));
  xhr.onabort = () => queue.pushDone();

  xhr.open(options.method ?? 'POST', url, true);
  for (const [k, v] of Object.entries(options.headers ?? {})) {
    try {
      xhr.setRequestHeader(k, v);
    } catch {
      // some platforms restrict certain headers — skip silently
    }
  }
  try {
    xhr.send(options.body);
  } catch (err) {
    queue.pushError(err instanceof Error ? err : new Error(String(err)));
  }

  const parser = new SSEParser();
  try {
    for (;;) {
      const item = await queue.next();
      if (item.error) throw item.error;
      if (item.done) {
        for (const event of parser.end()) yield event;
        return;
      }
      if (item.text !== undefined) {
        for (const event of parser.push(item.text)) yield event;
      }
    }
  } finally {
    try {
      xhr.abort();
    } catch {
      // already finished
    }
    void failedBody;
  }
}
