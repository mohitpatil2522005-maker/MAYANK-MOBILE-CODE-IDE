/**
 * Provider layer end-to-end with mocked transport (Phase 5):
 * a fake XMLHttpRequest streams SSE into the real streamSSE parser,
 * and a mocked fetch covers listModels/testConnection. Plus fileRefs.
 */
import { harness } from './harness';
import { OpenAICompatibleClient } from '../src/lib/ai/providers/openaiCompatible';
import { AnthropicClient } from '../src/lib/ai/providers/anthropic';
import { GoogleClient } from '../src/lib/ai/providers/google';
import { extractProjectFileRefs } from '../src/lib/ai/fileRefs';
import type { AIProviderConfig, StreamToken } from '../src/lib/ai/types';
import type { FileNode } from '../src/lib/fs/types';

const t = harness('providers (mocked transport)');

// --- Fake XHR transport -----------------------------------------------------
interface Fixture {
  status: number;
  body: string;
}
const sseFixtures = new Map<string, Fixture>();
let lastRequest: { url: string; headers: Record<string, string>; body?: string } | null = null;

class FakeXHR {
  status = 0;
  responseText = '';
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private headers: Record<string, string> = {};
  private url = '';
  private body?: string;

  open(_method: string, url: string): void {
    this.url = url;
  }
  setRequestHeader(k: string, v: string): void {
    this.headers[k] = v;
  }
  send(body?: string): void {
    this.body = body;
    lastRequest = { url: this.url, headers: this.headers, body };
    const fixture = sseFixtures.get(this.url) ?? { status: 404, body: 'not found' };
    queueMicrotask(() => {
      this.status = fixture.status;
      if (fixture.status >= 400) {
        this.responseText = fixture.body;
        this.onload?.();
        return;
      }
      const mid = Math.ceil(fixture.body.length / 2);
      this.responseText = fixture.body.slice(0, mid);
      this.onprogress?.();
      queueMicrotask(() => {
        this.responseText = fixture.body;
        this.onprogress?.();
        queueMicrotask(() => this.onload?.());
      });
    });
  }
  abort(): void {
    this.onabort?.();
  }
}
(globalThis as Record<string, unknown>).XMLHttpRequest = FakeXHR;

// --- Fake fetch for non-streaming endpoints ---------------------------------
const fetchFixtures = new Map<string, { status: number; json: unknown }>();
(globalThis as Record<string, unknown>).fetch = async (url: unknown) => {
  const fixture = fetchFixtures.get(String(url)) ?? { status: 404, json: { message: 'no fixture' } };
  return {
    ok: fixture.status < 400,
    status: fixture.status,
    text: async () => JSON.stringify(fixture.json),
  } as Response;
};

function cfg(type: AIProviderConfig['type'], baseURL: string): AIProviderConfig {
  return { id: `${type}-t`, name: type, type, baseURL, models: [], createdAt: 0 };
}

async function collect(stream: AsyncGenerator<StreamToken>): Promise<StreamToken[]> {
  const out: StreamToken[] = [];
  for await (const token of stream) out.push(token);
  return out;
}

function texts(tokens: StreamToken[]): string {
  return tokens.filter((tok) => tok.type === 'text').map((tok) => tok.text).join('');
}

async function main() {
  t.section('OpenAI-compatible streaming (XHR → SSE → tokens)');
  {
    sseFixtures.set('https://api.openai.com/v1/chat/completions', {
      status: 200,
      body:
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":", world"}}]}\n\n' +
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
        'data: [DONE]\n\n',
    });
    const client = new OpenAICompatibleClient(cfg('openai', 'https://api.openai.com/v1'));
    const tokens = await collect(client.chat({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] }, 'sk-test'));
    t.check('streamed text joined', texts(tokens), 'Hello, world');
    t.check('ends with done', tokens[tokens.length - 1].type, 'done');
    t.check('auth header sent', lastRequest?.headers.Authorization, 'Bearer sk-test');
    t.check('request model in body', JSON.parse(lastRequest?.body ?? '{}').model, 'gpt-4o');
    t.check('stream flag set', JSON.parse(lastRequest?.body ?? '{}').stream, true);
  }

  t.section('OpenAI HTTP error surfaces sanitized');
  {
    sseFixtures.set('https://bad.example/v1/chat/completions', {
      status: 401,
      body: '{"error":{"message":"Incorrect API key provided: Bearer sk-realkey123456789"}}',
    });
    const client = new OpenAICompatibleClient(cfg('custom', 'https://bad.example/v1'));
    const tokens = await collect(client.chat({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }, 'sk-realkey123456789'));
    t.check('error token produced', tokens[0].type, 'error');
    t.check('status in message', tokens[0].error?.includes('HTTP 401'), true);
    t.check('raw key not leaked fully', !tokens[0].error?.includes('Bearer sk-realkey123456789'), true);
  }

  t.section('Anthropic streaming + system handling');
  {
    sseFixtures.set('https://api.anthropic.com/v1/messages', {
      status: 200,
      body:
        'data: {"type":"message_start"}\n\n' +
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n' +
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" there"}}\n\n' +
        'data: {"type":"message_stop"}\n\n',
    });
    const client = new AnthropicClient(cfg('anthropic', 'https://api.anthropic.com/v1'));
    const tokens = await collect(
      client.chat(
        {
          model: 'claude-sonnet-4-20250514',
          messages: [
            { role: 'system', content: 'You are terse.' },
            { role: 'user', content: 'hi' },
          ],
        },
        'sk-ant-x',
      ),
    );
    t.check('streamed text joined', texts(tokens), 'Hi there');
    t.check('system hoisted out of messages', (() => {
      const body = JSON.parse(lastRequest?.body ?? '{}');
      return body.system === 'You are terse.' && body.messages.length === 1;
    })(), true);
    t.check('api key header', lastRequest?.headers['x-api-key'], 'sk-ant-x');
    t.check('anthropic version header', lastRequest?.headers['anthropic-version'], '2023-06-01');
  }

  t.section('Google streaming');
  {
    sseFixtures.set(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse',
      {
        status: 200,
        body:
          'data: {"candidates":[{"content":{"parts":[{"text":"Hey"},{"text":"!"}]}}]}\n\n' +
          'data: {"candidates":[{"content":{"parts":[{"text":" done"}]}}]}\n\n',
      },
    );
    const client = new GoogleClient(cfg('google', 'https://generativelanguage.googleapis.com/v1beta'));
    const tokens = await collect(
      client.chat({ model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'yo' }] }, 'gkey'),
    );
    t.check('streamed text joined', texts(tokens), 'Hey! done');
    t.check('key header used (not URL)', lastRequest?.headers['x-goog-api-key'], 'gkey');
    t.check('URL has no key', !lastRequest?.url.includes('key='), true);

    const noKey = await collect(
      client.chat({ model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'yo' }] }, null),
    );
    t.check('missing key → error token', noKey[0].type, 'error');
  }

  t.section('listModels via mocked fetch');
  {
    fetchFixtures.set('https://api.groq.com/openai/v1/models', {
      status: 200,
      json: { data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'llama-3.1-8b-instant' }] },
    });
    const groq = new OpenAICompatibleClient(cfg('groq', 'https://api.groq.com/openai/v1'));
    const models = await groq.listModels('gsk_x');
    t.check('groq models listed', models.map((m) => m.id), ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']);
    t.check('context window guessed', models[1].contextWindow, 128000);

    const result = await groq.testConnection('gsk_x');
    t.check('testConnection ok', result.ok, true);

    fetchFixtures.set('https://api.anthropic.com/v1/models', {
      status: 200,
      json: { data: [{ id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4' }] },
    });
    const ant = new AnthropicClient(cfg('anthropic', 'https://api.anthropic.com/v1'));
    const antModels = await ant.listModels('sk-ant-y');
    t.check('anthropic display name', antModels[0].displayName, 'Claude Sonnet 4');

    fetchFixtures.set('https://generativelanguage.googleapis.com/v1beta/models', {
      status: 200,
      json: {
        models: [
          { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
          { name: 'models/imagen-3', displayName: 'Imagen' },
        ],
      },
    });
    const goo = new GoogleClient(cfg('google', 'https://generativelanguage.googleapis.com/v1beta'));
    const gooModels = await goo.listModels('gkey');
    t.check('gemini-only filter + prefix strip', gooModels.map((m) => m.id), ['gemini-2.0-flash']);
  }

  t.section('fileRefs');
  {
    const tree: FileNode[] = [
      { uri: 'u1', name: 'agent.ts', path: 'src/lib/ai/agent.ts', type: 'file' },
      { uri: 'u2', name: 'agent.tsx', path: 'app/(tabs)/agent.tsx', type: 'file' },
      { uri: 'u3', name: 'README.md', path: 'README.md', type: 'file' },
    ];
    const refs1 = extractProjectFileRefs('Check `src/lib/ai/agent.ts` for the loop.', tree);
    t.check('exact path found', refs1.map((r) => r.path), ['src/lib/ai/agent.ts']);
    const refs2 = extractProjectFileRefs('Open README.md please.', tree);
    t.check('unambiguous filename found', refs2.map((r) => r.path), ['README.md']);
    const refs3 = extractProjectFileRefs('See agent.ts (the lib one).', tree);
    t.check('ambiguous partial path resolves by suffix', refs3.map((r) => r.path), ['src/lib/ai/agent.ts']);
    const refs4 = extractProjectFileRefs('Nothing about missing.ts here.', tree);
    t.check('no false positives', refs4.length, 0);
  }

  t.done();
}

main().catch((err) => {
  console.error('SUITE CRASHED', err);
  process.exit(1);
});
