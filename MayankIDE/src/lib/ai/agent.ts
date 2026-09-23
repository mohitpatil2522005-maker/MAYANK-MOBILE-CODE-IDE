/**
 * Agent context assembly + prompt building (pure functions — unit-testable).
 * Implements agent.md §5 (system prompt) and §8 (context management).
 */
import type { FileNode } from '@/src/lib/fs/types';
import { toolSpecsForPrompt } from './tools';
import type { ChatMessage } from './types';

export interface AgentContext {
  projectName: string;
  fileCount: number;
  /** Active editor file (already capped); null when nothing is open. */
  currentFile: { path: string; language: string; content: string } | null;
  /** Current selection in the editor (already capped); null when empty. */
  selection: string | null;
  /** 2-level tree listing. */
  treePreview: string;
}

export const CURRENT_FILE_CHAR_CAP = 12_000;
export const SELECTION_CHAR_CAP = 4_000;
export const HISTORY_CHAR_BUDGET = 14_000;
const TREE_MAX_LINES = 80;

/** Indented 2-level directory listing for the system prompt. */
export function shallowTreePreview(nodes: FileNode[], maxLines = TREE_MAX_LINES): string {
  const out: string[] = [];
  const walk = (list: FileNode[], depth: number) => {
    for (const node of list) {
      if (out.length >= maxLines) {
        out.push('  '.repeat(depth) + '…');
        return;
      }
      out.push('  '.repeat(depth) + (node.type === 'directory' ? `📁 ${node.name}/` : node.name));
      if (node.type === 'directory' && depth < 2 && node.children) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(nodes, 0);
  return out.join('\n');
}

export function countFiles(nodes: FileNode[]): number {
  let count = 0;
  const walk = (list: FileNode[]) => {
    for (const n of list) {
      if (n.type === 'file' && !n.truncated) count++;
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return count;
}

/** Cap long file bodies head+tail so line numbers stay meaningful at the top. */
export function capContent(content: string, cap = CURRENT_FILE_CHAR_CAP): string {
  if (content.length <= cap) return content;
  const head = content.slice(0, Math.floor(cap * 0.85));
  const tail = content.slice(-Math.floor(cap * 0.1));
  return `${head}\n\n// … [${content.length - head.length - tail.length} chars omitted] …\n\n${tail}`;
}

/** System prompt for the agent (agent.md §5 template + tool protocol). */
export function buildSystemPrompt(ctx: AgentContext): string {
  const parts: string[] = [
    `You are Forge, an AI coding assistant inside Mayank IDE.
You help the user write, understand, and improve code. Be concise and helpful; use markdown (headers, lists, fenced code blocks with a language tag).`,
    `## Current context`,
    `• Project: ${ctx.projectName} (${ctx.fileCount} files)`,
    ctx.currentFile
      ? `• Open file: ${ctx.currentFile.path} (${ctx.currentFile.language})`
      : '• Open file: none',
    ctx.selection ? '• The user has a selection in the editor (included below).' : '',
    '',
    '## Project tree (2 levels)',
    '```',
    ctx.treePreview || '(empty)',
    '```',
  ];

  if (ctx.currentFile) {
    parts.push(
      '',
      `## Open file content — ${ctx.currentFile.path}`,
      '```' + ctx.currentFile.language,
      ctx.currentFile.content,
      '```',
    );
  }
  if (ctx.selection) {
    parts.push('', '## User selection', '```', ctx.selection, '```');
  }

  parts.push(
    '',
    '## Tools',
    toolSpecsForPrompt(),
    '',
    `## Tool protocol
To call a tool, output ONE fenced block per call, EXACTLY in this form, and then STOP — wait for the results:

\`\`\`tool
{"tool": "read_file", "path": "src/index.ts"}
\`\`\`

Rules:
1. Always read a file before editing it — never edit blind.
2. Explain WHY before proposing a change; keep edits minimal.
3. edit_file's old_text must match the file EXACTLY (indentation included); prefer small, unique anchors.
4. write_file/edits are shown to the user as diff previews and applied ONLY if the user approves.
5. If unsure, ask the user instead of guessing. Never invent file contents or paths.
6. Match the project's existing style and conventions.
7. Do not emit more than 3 tool calls in one turn. No tool calls inside code examples.`,
  );

  return parts.filter((p) => p !== '').join('\n');
}

/**
 * Keep the conversation within a rough character budget (~4 chars/token),
 * always preserving the first system-less user message and the most recent turns.
 */
export function packHistory(messages: ChatMessage[], budget = HISTORY_CHAR_BUDGET): ChatMessage[] {
  const packed: ChatMessage[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const cost = msg.content.length + 16;
    if (used + cost > budget && packed.length > 0) {
      // Push a truncated copy of this message so it is not silently dropped,
      // then stop — older messages are beyond the budget.
      if (msg.content.length > 2000) {
        packed.unshift({ role: msg.role, content: msg.content.slice(0, 2000) + '\n… [truncated]' });
      } else {
        packed.unshift(msg);
      }
      break;
    }
    packed.unshift(msg);
    used += cost;
  }
  return packed;
}

/** Tool results fed back to the model as a user-role message. */
export interface ToolFeedback {
  tool: string;
  status: 'ok' | 'error' | 'rejected';
  /** Result body (file content, listing, …), already length-capped. */
  result?: string;
  error?: string;
  note?: string;
}

export function buildToolFeedbackMessage(feedback: ToolFeedback[]): string {
  const results = feedback.map((f) => ({
    tool: f.tool,
    status: f.status,
    ...(f.result !== undefined ? { result: f.result } : {}),
    ...(f.error ? { error: f.error } : {}),
    ...(f.note ? { note: f.note } : {}),
  }));
  return `TOOL_RESULTS (the user approved/rejected these as noted; continue with the information):\n\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\``;
}

/** Rough token estimate (~4 chars per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
