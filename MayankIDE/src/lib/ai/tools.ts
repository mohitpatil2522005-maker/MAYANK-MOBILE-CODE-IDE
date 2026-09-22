/**
 * Agent tool system — schemas + parsing (agent.md §3–§4).
 *
 * The agent emits tool calls as fenced code blocks:
 *
 *   ```tool
 *   {"tool": "read_file", "path": "src/App.tsx"}
 *   ```
 *
 * (`json` fences containing a {"tool": …} object and legacy
 * "🔧 TOOL_CALL: {…}" lines are also accepted.)
 *
 * Parsing is pure and stream-friendly:
 *  - `extractToolCalls` — run on a completed assistant message.
 *  - `stripStreamingToolText` — hide a trailing in-progress tool block while streaming.
 */

export type ToolName =
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'list_files'
  | 'search_code'
  | 'explain_selection';

export const TOOL_NAMES: readonly ToolName[] = [
  'read_file',
  'write_file',
  'edit_file',
  'list_files',
  'search_code',
  'explain_selection',
];

/** Read-only tools auto-execute; write/edit always require user approval. */
export const READ_ONLY_TOOLS: ReadonlySet<ToolName> = new Set([
  'read_file',
  'list_files',
  'search_code',
  'explain_selection',
]);

export interface ToolArgSpec {
  name: string;
  type: 'string' | 'boolean' | 'number';
  required: boolean;
  description: string;
}

export interface ToolSpec {
  name: ToolName;
  summary: string;
  args: ToolArgSpec[];
  readOnly: boolean;
}

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'read_file',
    summary: 'Read a project file (path is relative to the project root).',
    readOnly: true,
    args: [{ name: 'path', type: 'string', required: true, description: 'e.g. "src/App.tsx"' }],
  },
  {
    name: 'write_file',
    summary: 'Create a new file or fully replace an existing one. Requires user approval.',
    readOnly: false,
    args: [
      { name: 'path', type: 'string', required: true, description: 'project-relative path' },
      { name: 'content', type: 'string', required: true, description: 'full file content' },
    ],
  },
  {
    name: 'edit_file',
    summary: 'Targeted edit via exact string match. Requires user approval.',
    readOnly: false,
    args: [
      { name: 'path', type: 'string', required: true, description: 'project-relative path' },
      { name: 'old_text', type: 'string', required: true, description: 'exact text to replace' },
      { name: 'new_text', type: 'string', required: true, description: 'replacement text' },
      {
        name: 'replace_all',
        type: 'boolean',
        required: false,
        description: 'replace every occurrence (default false)',
      },
    ],
  },
  {
    name: 'list_files',
    summary: 'List files in a directory.',
    readOnly: true,
    args: [
      { name: 'path', type: 'string', required: false, description: 'directory (default: root)' },
      { name: 'recursive', type: 'boolean', required: false, description: 'default true' },
    ],
  },
  {
    name: 'search_code',
    summary: 'Search file contents for a string or regex pattern.',
    readOnly: true,
    args: [
      { name: 'pattern', type: 'string', required: true, description: 'search text or regex' },
      { name: 'path', type: 'string', required: false, description: 'subdirectory (default: all)' },
      { name: 'regex', type: 'boolean', required: false, description: 'default false' },
    ],
  },
  {
    name: 'explain_selection',
    summary: 'Explain the code the user currently has selected in the editor.',
    readOnly: true,
    args: [],
  },
];

export interface ParsedToolCall {
  tool: ToolName;
  args: Record<string, unknown>;
  /** Raw JSON payload as received (for debugging/result echo). */
  raw: string;
}

export interface ExtractedTools {
  /** Valid tool calls found in the message, in order. */
  calls: ParsedToolCall[];
  /** Message text with tool-call blocks stripped (what the user should read). */
  cleanText: string;
}

const FENCE_RE = /```(tool|json)[ \t]*\r?\n([\s\S]*?)```/g;
const LEGACY_RE = /🔧\s*TOOL_CALL:\s*(\{[^\r\n]*\})/g;

function normalizeCall(obj: Record<string, unknown>, raw: string): ParsedToolCall | null {
  const tool = obj.tool;
  if (typeof tool !== 'string' || !TOOL_NAMES.includes(tool as ToolName)) return null;
  const { tool: _omit, ...args } = obj;
  // Coerce common loose values
  if (typeof args.replace_all === 'string') args.replace_all = args.replace_all === 'true';
  if (typeof args.recursive === 'string') args.recursive = args.recursive !== 'false';
  if (typeof args.regex === 'string') args.regex = args.regex === 'true';
  for (const key of ['path', 'old_text', 'new_text', 'content', 'pattern'] as const) {
    if (args[key] !== undefined && typeof args[key] !== 'string') {
      args[key] = String(args[key]);
    }
  }
  return { tool: tool as ToolName, args, raw };
}

/** Parse a completed assistant message into tool calls + displayable text. */
export function extractToolCalls(text: string): ExtractedTools {
  const calls: ParsedToolCall[] = [];
  const consumed: [number, number][] = [];

  for (const match of text.matchAll(FENCE_RE)) {
    const raw = match[2].trim();
    const start = match.index ?? 0;
    const end = start + match[0].length;
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const call = normalizeCall(obj, raw);
      if (call) {
        calls.push(call);
        consumed.push([start, end]);
      }
      // ```json blocks without a "tool" key stay visible as ordinary code
    } catch {
      // malformed tool JSON: leave the block visible so the user sees it
    }
  }

  for (const match of text.matchAll(LEGACY_RE)) {
    const raw = match[1].trim();
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (consumed.some(([s, e]) => start >= s && end <= e)) continue;
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const call = normalizeCall(obj, raw);
      if (call) {
        calls.push(call);
        consumed.push([start, end]);
      }
    } catch {
      // leave visible
    }
  }

  // Remove consumed spans, then tidy leftover blank lines.
  let clean = '';
  let cursor = 0;
  for (const [s, e] of consumed.sort((a, b) => a[0] - b[0])) {
    clean += text.slice(cursor, s);
    cursor = e;
  }
  clean += text.slice(cursor);
  const cleanText = clean.replace(/\n{3,}/g, '\n\n').trim();

  return { calls, cleanText };
}

/**
 * While streaming: hide a trailing tool block so users never see partial
 * JSON. Only an UNCLOSED trailing fence is hidden — closed ```json blocks
 * (e.g. ordinary JSON examples in the reply) stay visible, and any prose
 * after a completed tool block is not swallowed mid-stream.
 * Fences pair in order (marker i opens, marker i+1 closes), so an odd
 * trailing marker means the block is still streaming in.
 */
export function stripStreamingToolText(text: string): string {
  const markers = [...text.matchAll(/```/g)].map((m) => m.index ?? 0);
  for (let i = 0; i < markers.length; i += 2) {
    const open = markers[i];
    const isToolFence = /^```(tool|json)[ \t]*\r?(\n|$)/.test(text.slice(open, open + 40));
    if (!isToolFence) continue;
    const closed = i + 1 < markers.length;
    if (!closed) return text.slice(0, open).trimEnd();
  }
  const legacyIdx = text.search(/🔧\s*TOOL_CALL/);
  if (legacyIdx >= 0) return text.slice(0, legacyIdx).trimEnd();
  return text;
}

/** Render the specs as compact instructions for the system prompt. */
export function toolSpecsForPrompt(): string {
  return TOOL_SPECS.map((spec) => {
    const args =
      spec.args.length === 0
        ? '(no arguments)'
        : spec.args
            .map((a) => `"${a.name}"${a.required ? '' : '?'}: ${a.type} — ${a.description}`)
            .join(', ');
    return `• ${spec.name}: ${spec.summary}\n  args: { ${args} }`;
  }).join('\n');
}
