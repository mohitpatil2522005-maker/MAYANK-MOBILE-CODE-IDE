/**
 * sessionToMarkdown (PRD US-09 export): headings, hidden-turn filtering,
 * tool-call summarization, terminal markers.
 * Run: npm test
 */
import { sessionToMarkdown } from '../src/lib/ai/sessionExport';
import type { AgentMessage, ToolCall } from '../src/store/agentStore';
import { harness } from './harness';

const t = harness('session-export');
const META = { target: 'OpenAI · gpt-4.1', project: 'demo-app' };

function msg(partial: Partial<AgentMessage> & { role: AgentMessage['role'] }): AgentMessage {
  return {
    id: Math.random().toString(36).slice(2),
    content: '',
    createdAt: 1,
    status: 'done',
    ...partial,
  } as AgentMessage;
}

function call(partial: Partial<ToolCall>): ToolCall {
  return {
    id: Math.random().toString(36).slice(2),
    tool: 'write_file',
    args: {},
    summary: '',
    status: 'executed',
    visible: true,
    ...partial,
  } as ToolCall;
}

t.section('structure');
{
  const md = sessionToMarkdown(
    [msg({ role: 'user', content: 'hi' }), msg({ role: 'assistant', content: 'hello' })],
    META,
  );
  t.check('starts with title', md.startsWith('# Mayank IDE — Forge session'), true);
  t.check('model meta line', md.includes('- **Model:** OpenAI · gpt-4.1'), true);
  t.check('project meta line', md.includes('- **Project:** demo-app'), true);
  t.check('exported timestamp', /- \*\*Exported:\*\* \d{4}-\d{2}-\d{2}T/.test(md), true);
  t.check('user heading', md.includes('### 🧑 You'), true);
  t.check('assistant heading', md.includes('### ✨ Forge'), true);
  t.check('bodies present', md.includes('hi') && md.includes('hello'), true);
  t.check('footer', md.includes('_Exported from Mayank IDE._'), true);
}

t.section('filtering & markers');
{
  const md = sessionToMarkdown(
    [
      msg({ role: 'user', content: 'visible' }),
      msg({ role: 'assistant', content: 'SECRET_FEEDBACK', hidden: true }),
      msg({ role: 'note', content: 'switched model' }),
      msg({ role: 'assistant', content: 'oops', status: 'error' }),
      msg({ role: 'assistant', content: 'stopped', status: 'cancelled' }),
    ],
    { ...META, project: null },
  );
  t.check('hidden feedback omitted', md.includes('SECRET_FEEDBACK'), false);
  t.check('visible content kept', md.includes('visible'), true);
  t.check('note as blockquote', md.includes('> ℹ️ switched model'), true);
  t.check('error marker', md.includes('_(request failed)_'), true);
  t.check('cancelled marker', md.includes('_(cancelled)_'), true);
  t.check('null project rendered', md.includes('- **Project:** none'), true);
}

t.section('tool calls');
{
  const md = sessionToMarkdown(
    [
      msg({
        role: 'assistant',
        content: 'done',
        toolCalls: [
          call({ tool: 'write_file', args: { path: 'src/a.ts' }, summary: '12 lines written', status: 'applied' }),
          call({ tool: 'delete_file', args: { path: 'old.js' }, status: 'rejected' }),
          call({ tool: 'list_files', args: {}, status: 'failed', summary: 'no project open' }),
          call({ tool: 'read_file', args: { path: 'x.ts' }, status: 'running' }),
          call({ tool: 'edit_file', args: { path: 'y.ts' }, status: 'pending-approval' }),
        ],
      }),
    ],
    META,
  );
  t.check('tool path + status', md.includes('> 🔧 `write_file` `src/a.ts` · applied — 12 lines written'), true);
  t.check('rejected label', md.includes('`delete_file` `old.js` · rejected by user'), true);
  t.check('failed with summary', md.includes('`list_files` · failed — no project open'), true);
  t.check('running → interrupted', md.includes('`read_file` `x.ts` · interrupted'), true);
  t.check('pending → not resolved', md.includes('`edit_file` `y.ts` · not resolved'), true);
}

t.done();
