/**
 * Golden session test (masterprompt §13.5 "Golden sessions"):
 * scripted agent runs against a fake provider, through the REAL app code —
 * agentStore loop + SSE transport/parse + tool executor + permission
 * (approval) gating + mode enforcement + usage meter + audit log.
 *
 * The fake provider is a scripted OpenAI-compatible SSE stream served by a
 * fake XMLHttpRequest; the project is the in-memory demo project, so file
 * reads/writes hit real (in-memory) demo storage.
 *
 * Built + run via: node tests/golden/build.cjs  (see build.cjs for why).
 */
import { harness } from './harness';
import { useAgentStore } from '../src/store/agentStore';
import { useProjectStore } from '../src/store/projectStore';
import { useProviderRegistry } from '../src/lib/ai/registry';
import { getAudit } from '../src/lib/ai/audit';
import { readDemoFile } from '../src/lib/fs/demoProject';
import type { FileNode } from '../src/lib/fs/types';

const t = harness('golden session (real loop, fake provider)');

const GREETER = 'demo://src/greeter.ts';
const GREETER_ORIGINAL = readDemoFile(GREETER);

// --- Scripted fake provider (fake XHR → real SSE parser) -------------------

interface ScriptedResponse {
  status: number;
  /** Text deltas to stream (OpenAI SSE shape). */
  parts?: string[];
  /** Raw response body (error fixtures). */
  raw?: string;
}
const script: ScriptedResponse[] = [];
const requests: { url: string; body: Record<string, unknown> }[] = [];

function sseOf(parts: string[]): string {
  return (
    parts.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join('') +
    'data: [DONE]\n\n'
  );
}

function toolCallLine(obj: Record<string, unknown>): string[] {
  return ['```tool\n' + JSON.stringify(obj) + '\n```'];
}

class FakeXHR {
  status = 0;
  responseText = '';
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private url = '';
  private headers: Record<string, string> = {};

  open(_method: string, url: string): void {
    this.url = url;
  }
  setRequestHeader(k: string, v: string): void {
    this.headers[k] = v;
  }
  send(body?: string): void {
    const resp =
      script.length > 0
        ? script.shift()!
        : { status: 500, raw: '{"error":{"message":"test script exhausted"}}' };
    requests.push({ url: this.url, body: body ? (JSON.parse(body) as Record<string, unknown>) : {} });
    queueMicrotask(() => {
      this.status = resp.status;
      this.responseText = resp.raw ?? sseOf(resp.parts ?? []);
      this.onprogress?.();
      queueMicrotask(() => this.onload?.());
    });
  }
  abort(): void {
    this.onabort?.();
  }
}
(globalThis as Record<string, unknown>).XMLHttpRequest = FakeXHR;

// --- Helpers ---------------------------------------------------------------

const agent = () => useAgentStore.getState();
const demoTreeFiles = (): string[] => {
  const out: string[] = [];
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.type === 'file') out.push(n.path);
      if (n.children) walk(n.children);
    }
  };
  walk(useProjectStore.getState().tree);
  return out;
};
const assistantMessages = () =>
  agent().messages.filter((m) => m.role === 'assistant');
const pendingCalls = () =>
  assistantMessages()
    .flatMap((m) => m.toolCalls ?? [])
    .filter((c) => c.status === 'pending-approval');
const auditOf = (decision: string) =>
  getAudit().filter((e) => e.decision === decision);

async function main() {
  t.section('setup');
  const provider = useProviderRegistry.getState().addProvider({
    name: 'Fake Local',
    type: 'custom',
    baseURL: 'http://fake.local/v1',
    models: [{ id: 'fake-model' }],
    defaultModel: 'fake-model',
  });
  agent().selectModel(provider.id, 'fake-model');
  useProjectStore.getState().openDemoProject();
  t.check('demo project open', useProjectStore.getState().projectName, 'demo-project');
  t.check('default mode is agent', agent().mode, 'agent');

  // ── Ask mode: read auto-runs, writes blocked, cap enforced ──────────────
  t.section('ask mode: read-only enforced + safety cap');
  agent().setMode('ask');
  t.check('mode persisted as ask', agent().mode, 'ask');
  script.push(
    { parts: ['Let me read the file first.\n\n', ...toolCallLine({ tool: 'read_file', path: 'src/greeter.ts' })] },
    // Plenty of write attempts to blow through the ask-mode cap (6).
    ...Array.from({ length: 10 }, () => ({
      parts: [
        'I would change it like this:\n\n',
        ...toolCallLine({
          tool: 'edit_file',
          path: 'src/greeter.ts',
          old_text: 'return `Hello, ${name}! Welcome to Mayank IDE.`;',
          new_text: 'return `Hey, ${name}!`;',
        }),
      ],
    })),
  );
  await agent().sendMessage('Update the greeting in greeter.ts');
  t.check('phase idle after cap', agent().phase, 'idle');

  const askAssistants = assistantMessages();
  t.check('6 model turns (ask cap)', askAssistants.length, 6);
  const askCalls = askAssistants.flatMap((m) => m.toolCalls ?? []);
  t.check('first tool auto-executed (read_file)', askCalls[0]?.status, 'executed');
  t.check('remaining 5 writes blocked', askCalls.slice(1).every((c) => c.status === 'failed'), true);
  t.check('demo file untouched', readDemoFile(GREETER), GREETER_ORIGINAL);
  t.check('audit: 1 auto-executed', auditOf('auto-executed').length, 1);
  t.check('audit: 5 mode-blocked', auditOf('mode-blocked').length, 5);
  t.check(
    'mode-blocked entries carry mode=ask',
    auditOf('mode-blocked').every((e) => e.mode === 'ask'),
    true,
  );
  t.check('cap note appended', agent().messages[agent().messages.length - 1]?.content.includes('safety limit'), true);
  t.check('usage: 6 model calls', agent().usage.modelCalls, 6);
  t.check('usage: input tokens counted', agent().usage.inTokens > 0, true);
  t.check('usage: output tokens counted', agent().usage.outTokens > 0, true);

  // Notes (app-internal) must not leak into the model history.
  script.length = 0;
  script.push({ parts: ['Ok, understood.'] });
  await agent().sendMessage('ok');
  const lastBody = requests[requests.length - 1].body as {
    model: string;
    messages: { role: string; content: string }[];
  };
  t.check('request targets fake model', lastBody.model, 'fake-model');
  t.check('system prompt states Ask mode', lastBody.messages[0].content.includes('## Mode: Ask'), true);
  t.check('note message not sent to model', lastBody.messages.some((m) => m.content.includes('safety limit')), false);
  t.check('user turn present', lastBody.messages.some((m) => m.content === 'ok'), true);

  // ── Agent mode: read → propose → approve → apply → resume ───────────────
  t.section('agent mode: approve path applies the edit');
  agent().newChat();
  agent().setMode('agent');
  script.length = 0;
  script.push(
    { parts: ['Reading first.\n\n', ...toolCallLine({ tool: 'read_file', path: 'src/greeter.ts' })] },
    {
      parts: [
        'Now the fix:\n\n',
        ...toolCallLine({
          tool: 'edit_file',
          path: 'src/greeter.ts',
          old_text: 'return `Hello, ${name}! Welcome to Mayank IDE.`;',
          new_text: 'return `Hey, ${name} — welcome!`;',
        }),
      ],
    },
    { parts: ['Done! The greeting in src/greeter.ts is updated.'] },
  );
  await agent().sendMessage('Fix the greeting');
  t.check('paused for approval', agent().phase, 'awaiting-approval');
  const pending = pendingCalls();
  t.check('one pending edit', pending.length, 1);
  t.check('edit is a diff preview', pending[0]?.preview?.kind, 'diff');
  t.check('file unchanged before approval', readDemoFile(GREETER), GREETER_ORIGINAL);

  const pendingMsg = assistantMessages().find((m) => m.toolCalls?.some((c) => c.callId === pending[0]?.callId))!;
  await agent().approveToolCall(pendingMsg.id, pending[0]!.callId);
  t.check('loop resumed to idle', agent().phase, 'idle');
  t.check('edit applied to demo file', readDemoFile(GREETER).includes('Hey, ${name} — welcome!'), true);
  const appliedCall = assistantMessages().flatMap((m) => m.toolCalls ?? []).find((c) => c.callId === pending[0]?.callId);
  t.check('call status applied', appliedCall?.status, 'applied');
  t.check('final answer present', assistantMessages()[assistantMessages().length - 1]?.content.includes('Done!'), true);
  t.check('editor reveal target set', agent().lastAppliedEdit?.path, 'src/greeter.ts');
  t.check('usage reset by newChat then 3 calls', agent().usage.modelCalls, 3);
  t.check(
    'audit trail: pending + approved edit',
    [auditOf('pending').some((e) => e.tool === 'edit_file'), auditOf('approved').some((e) => e.tool === 'edit_file')],
    [true, true],
  );

  // ── Agent mode: reject path leaves the file untouched ───────────────────
  t.section('agent mode: reject path');
  agent().newChat();
  script.length = 0;
  script.push(
    {
      parts: [
        'Adding the file:\n\n',
        ...toolCallLine({ tool: 'write_file', path: 'src/added.ts', content: 'export const added = true;\n' }),
      ],
    },
    { parts: ['Understood — I will not add it.'] },
  );
  await agent().sendMessage('Add src/added.ts');
  t.check('paused for new-file approval', agent().phase, 'awaiting-approval');
  const newFileCall = pendingCalls()[0];
  t.check('new-file preview', newFileCall?.preview?.kind, 'new-file');
  const rejectMsg = assistantMessages().find((m) => m.toolCalls?.some((c) => c.callId === newFileCall?.callId))!;
  agent().rejectToolCall(rejectMsg.id, newFileCall!.callId);
  // maybeResume continues asynchronously
  await new Promise((r) => setTimeout(r, 50));
  t.check('idle after reject', agent().phase, 'idle');
  t.check(
    'rejected call marked',
    assistantMessages().flatMap((m) => m.toolCalls ?? []).find((c) => c.callId === newFileCall?.callId)?.status,
    'rejected',
  );
  t.check('file was NOT created', demoTreeFiles().includes('src/added.ts'), false);
  t.check('audit: rejected', auditOf('rejected').length, 1);

  // ── Error path: HTTP 401 surfaces, retry recovers ────────────────────────
  t.section('error + retry');
  agent().newChat();
  script.length = 0;
  script.push(
    { status: 401, raw: '{"error":{"message":"Invalid API key"}}' },
    { parts: ['Recovered!'] },
  );
  await agent().sendMessage('hi');
  t.check('error surfaced', assistantMessages()[assistantMessages().length - 1]?.status, 'error');
  t.check('error mentions HTTP 401', assistantMessages()[assistantMessages().length - 1]?.content.includes('HTTP 401'), true);
  await agent().retryLast();
  t.check('retry succeeded', assistantMessages()[assistantMessages().length - 1]?.status, 'complete');
  t.check('retry content', assistantMessages()[assistantMessages().length - 1]?.content, 'Recovered!');

  // ── Regression: approval loop is capped (no infinite approve cycle) ─────
  t.section('safety cap applies to the approval loop');
  agent().newChat();
  agent().setMode('agent');
  // The model keeps proposing an edit; the user keeps approving. Each new
  // old_text matches the file state after the previous approval was applied.
  // (Plain concatenation — the edit content contains literal `${name}`.)
  const greeting = (suffix: string) => 'return `Hey, ${name} — welcome!' + suffix + '`;';
  script.length = 0;
  for (let i = 0; i < 12; i++) {
    script.push({
      parts: [
        'One more tweak:\n\n',
        ...toolCallLine({
          tool: 'edit_file',
          path: 'src/greeter.ts',
          old_text: greeting(i === 0 ? '' : ` v${i - 1}`),
          new_text: greeting(` v${i}`),
        }),
      ],
    });
  }
  await agent().sendMessage('Keep tweaking the greeting');
  let approvals = 0;
  while (agent().phase === 'awaiting-approval' && approvals < 50) {
    const call = pendingCalls()[0];
    if (!call) break;
    const msg = assistantMessages().find((m) => m.toolCalls?.some((c) => c.callId === call.callId))!;
    await agent().approveToolCall(msg.id, call.callId);
    approvals++;
  }
  t.check('loop stopped (cap enforced)', agent().phase, 'idle');
  t.check('approvals were capped (<=8)', approvals <= 8, true);
  t.check('approvals actually happened', approvals > 1, true);
  t.check(
    'cap note for approval loop',
    agent().messages[agent().messages.length - 1]?.role === 'note',
    true,
  );

  t.done();
}

main().catch((err) => {
  console.error('GOLDEN SUITE CRASHED', err);
  process.exit(1);
});
