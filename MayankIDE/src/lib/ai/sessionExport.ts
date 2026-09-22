/**
 * Export an agent session to Markdown (PRD US-09).
 * Tool calls become summarized blockquote lines; hidden feedback turns and
 * heavy payloads are omitted.
 */
import type { AgentMessage } from '@/src/store/agentStore';

export interface SessionMeta {
  target: string; // "Provider · model"
  project: string | null;
  exportedAt?: Date;
}

const TOOL_STATUS_LABEL: Record<string, string> = {
  executed: 'done',
  applied: 'applied',
  failed: 'failed',
  rejected: 'rejected by user',
  running: 'interrupted',
  'pending-approval': 'not resolved',
};

export function sessionToMarkdown(messages: AgentMessage[], meta: SessionMeta): string {
  const when = (meta.exportedAt ?? new Date()).toISOString();
  const lines: string[] = [
    '# Mayank IDE — Forge session',
    '',
    `- **Model:** ${meta.target}`,
    `- **Project:** ${meta.project ?? 'none'}`,
    `- **Exported:** ${when}`,
    '',
    '---',
  ];

  for (const message of messages) {
    if (message.hidden) continue;
    if (message.role === 'note') {
      lines.push('', `> ℹ️ ${message.content}`, '');
      continue;
    }
    lines.push('', message.role === 'user' ? '### 🧑 You' : '### ✨ Forge', '');
    const body = message.content.trim();
    if (body) lines.push(body, '');
    if (message.status === 'cancelled') lines.push('_(cancelled)_', '');
    if (message.status === 'error') lines.push('_(request failed)_', '');

    for (const call of message.toolCalls ?? []) {
      const status = TOOL_STATUS_LABEL[call.status] ?? call.status;
      const target =
        typeof call.args.path === 'string' && call.args.path
          ? ` \`${call.args.path}\``
          : '';
      const detail = call.summary ? ` — ${call.summary}` : '';
      lines.push(`> 🔧 \`${call.tool}\`${target} · ${status}${detail}`);
    }
    if (message.toolCalls?.length) lines.push('');
  }

  lines.push('---', '', '_Exported from Mayank IDE._', '');
  return lines.join('\n');
}
