/** SSE parser + payload extractors + http helpers + presets (Phase 2). */
import { harness } from './harness';
import { SSEParser } from '../src/lib/ai/streaming';
import { extractOpenAIDeltas } from '../src/lib/ai/providers/openaiCompatible';
import { extractAnthropicDeltas } from '../src/lib/ai/providers/anthropic';
import { extractGeminiDeltas } from '../src/lib/ai/providers/google';
import { joinURL, guessContextWindow, snippet } from '../src/lib/ai/http';
import { PROVIDER_PRESETS, isInsecureEndpoint } from '../src/lib/ai/presets';

const t = harness('sse + extractors');

t.section('SSEParser');
{
  const p = new SSEParser();
  t.check('single complete event', p.push('data: {"a":1}\n\n'), ['{"a":1}']);
  t.check('split chunk, first half', p.push('da'), []);
  t.check('split chunk, rest', p.push('ta: {"b":2}\n\n'), ['{"b":2}']);
  t.check('multi-line data joined', p.push('data: x\ndata: y\n\n'), ['x\ny']);
  t.check('comments + event fields ignored', p.push(': hb\nevent: message\nid: 7\ndata: z\n\n'), ['z']);
  t.check('two events in one chunk', p.push('data: 1\n\ndata: 2\n\n'), ['1', '2']);
  t.check('unterminated flushes on end()', (() => { p.push('data: tail'); return p.end(); })(), ['tail']);
  t.check('CRLF tolerated', p.push('data: c\r\n\r\n'), ['c']);
}

t.section('OpenAI extractor');
{
  t.check('delta content', extractOpenAIDeltas('{"choices":[{"delta":{"content":"Hello"}}]}').texts, ['Hello']);
  t.check('two choices', extractOpenAIDeltas('{"choices":[{"delta":{"content":"a"}},{"delta":{"content":"b"}}]}').texts, ['a', 'b']);
  t.check('empty delta ignored', extractOpenAIDeltas('{"choices":[{"delta":{},"finish_reason":"stop"}]}').texts, []);
  t.check('api error surfaced', extractOpenAIDeltas('{"error":{"message":"Invalid API key"}}').error, 'Invalid API key');
  t.check('malformed flagged', extractOpenAIDeltas('not json').error?.startsWith('Malformed'), true);
}

t.section('Anthropic extractor');
{
  t.check('text delta', extractAnthropicDeltas('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}').texts, ['Hi']);
  t.check('message_stop → done', extractAnthropicDeltas('{"type":"message_stop"}').done, true);
  t.check('start events ignored', extractAnthropicDeltas('{"type":"message_start"}').texts, []);
  t.check('error surfaced', extractAnthropicDeltas('{"type":"error","error":{"message":"overloaded"}}').error, 'overloaded');
}

t.section('Gemini extractor');
{
  t.check('parts text', extractGeminiDeltas('{"candidates":[{"content":{"parts":[{"text":"Yo"},{"text":"!"}]}}]}').texts, ['Yo', '!']);
  t.check('api error surfaced', extractGeminiDeltas('{"error":{"message":"bad key"}}').error, 'bad key');
  t.check('safety block surfaced', extractGeminiDeltas('{"promptFeedback":{"blockReason":"SAFETY"}}').error, 'Blocked by safety filter (SAFETY)');
}

t.section('http helpers');
{
  t.check('joinURL trims', joinURL('https://x.com/v1/', '/models'), 'https://x.com/v1/models');
  t.check('joinURL no slash', joinURL('http://h:11434/v1', 'chat/completions'), 'http://h:11434/v1/chat/completions');
  t.check('context window known', guessContextWindow('gpt-4o-2024-08-06'), 128000);
  t.check('context window claude', guessContextWindow('claude-sonnet-4-20250514'), 200000);
  t.check('context window unknown', guessContextWindow('mystery-9'), undefined);
  t.check('snippet squashes whitespace', snippet('a\n\n  b   c', 100), 'a b c');
}

t.section('presets');
{
  t.check('five built-in types', Object.keys(PROVIDER_PRESETS).sort(), ['anthropic', 'custom', 'google', 'groq', 'openai']);
  t.check('custom endpoint key optional', PROVIDER_PRESETS.custom.requiresKey, false);
  t.check('openai key required', PROVIDER_PRESETS.openai.requiresKey, true);
  t.check('http flagged insecure', isInsecureEndpoint('http://192.168.1.5:11434/v1'), true);
  t.check('https not insecure', isInsecureEndpoint('https://api.openai.com/v1'), false);
}

t.done();
