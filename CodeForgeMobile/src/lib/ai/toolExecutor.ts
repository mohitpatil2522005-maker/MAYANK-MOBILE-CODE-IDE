/**
 * Executes agent tool calls against the live project (FS + stores).
 * Read-only tools run immediately; write/edit calls produce a preview here
 * and are applied by applyWriteCall() only after explicit user approval.
 */
import { computeLineDiff, type ComputedDiff } from '@/src/lib/diff';
import { projectFS } from '@/src/lib/fs/projectFs';
import type { FileNode } from '@/src/lib/fs/types';
import { isDirty, useProjectStore } from '@/src/store/projectStore';
import { capContent } from './agent';
import type { ParsedToolCall } from './tools';

const READ_RESULT_CAP = 12_000;
const SEARCH_MAX_FILES = 150;
const SEARCH_MAX_MATCHES = 40;
const LIST_MAX_ENTRIES = 200;

export interface ToolExecutionResult {
  ok: boolean;
  /** Short human summary shown on the tool card. */
  summary: string;
  /** Body fed back to the model (already capped). */
  feedback: string;
  error?: string;
  /** Line in the new document where the first change starts (write tools). */
  firstChangedLine?: number;
}

/** First changed line (1-based) in the NEW document of a diff. */
function firstChangedLineFromDiff(diff?: ComputedDiff): number | undefined {
  if (!diff) return undefined;
  let newLine = 0;
  for (const line of diff.lines) {
    if (line.type !== 'same') return newLine + 1;
    newLine += 1;
  }
  return undefined;
}

export interface WritePreview {
  kind: 'diff' | 'new-file';
  path: string;
  /** Present for edits to existing files. */
  diff?: ComputedDiff;
  /** Full content for new files (capped for display). */
  newContentPreview?: string;
  /** Content to write on approval (never capped). */
  fullContent: string;
  /** True when an open editor tab has unsaved changes this would overwrite. */
  conflictsWithOpenTab: boolean;
}

// --- helpers ---------------------------------------------------------------

function treeFiles(): FileNode[] {
  const out: FileNode[] = [];
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.type === 'file' && !n.truncated) out.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(useProjectStore.getState().tree);
  return out;
}

function findFileByPath(path: string): FileNode | null {
  const normalized = path.replace(/^\/+/, '');
  const files = treeFiles();
  return (
    files.find((f) => f.path === normalized) ??
    files.find((f) => f.path.endsWith('/' + normalized)) ??
    null
  );
}

/** Read source of truth for a path: open editor tab first, then disk. */
async function currentFileText(node: FileNode): Promise<string> {
  const open = useProjectStore.getState().openFiles.find((f) => f.uri === node.uri);
  if (open) return open.content;
  return projectFS.readFile(node.uri);
}

function arg(call: ParsedToolCall, name: string): string {
  const v = call.args[name];
  return typeof v === 'string' ? v : '';
}

// --- read-only tools --------------------------------------------------------

export async function executeReadOnlyTool(call: ParsedToolCall): Promise<ToolExecutionResult> {
  switch (call.tool) {
    case 'read_file': {
      const path = arg(call, 'path');
      const node = findFileByPath(path);
      if (!node) {
        const similar = treeFiles()
          .filter((f) => f.name === (path.split('/').pop() ?? path))
          .map((f) => f.path)
          .slice(0, 5);
        return {
          ok: false,
          summary: `Not found: ${path}`,
          feedback: `File not found: ${path}.${similar.length ? ` Similar files: ${similar.join(', ')}` : ''}`,
          error: 'file-not-found',
        };
      }
      const content = await projectFS.readFile(node.uri);
      return {
        ok: true,
        summary: `Read ${node.path} (${content.length} chars)`,
        feedback: `Content of ${node.path}:\n${capContent(content, READ_RESULT_CAP)}`,
      };
    }

    case 'list_files': {
      const path = arg(call, 'path');
      const recursive = call.args.recursive !== false;
      let files = treeFiles();
      if (path) files = files.filter((f) => f.path.startsWith(path.replace(/^\/+/, '') + '/') || f.path === path);
      const lines: string[] = [];
      for (const f of files) {
        if (!recursive && f.path.includes('/') && !path) continue;
        lines.push(f.path);
        if (lines.length >= LIST_MAX_ENTRIES) {
          lines.push(`… (${files.length - LIST_MAX_ENTRIES} more)`);
          break;
        }
      }
      const body = lines.join('\n') || '(no files)';
      return { ok: true, summary: `Listed ${Math.min(lines.length, LIST_MAX_ENTRIES)} entries`, feedback: body };
    }

    case 'search_code': {
      const pattern = arg(call, 'pattern');
      if (!pattern) return { ok: false, summary: 'Missing pattern', feedback: 'search_code needs a "pattern".', error: 'bad-args' };
      const subPath = arg(call, 'path');
      const useRegex = call.args.regex === true;
      let matcher: (line: string) => boolean;
      try {
        matcher = useRegex
          ? (() => { const re = new RegExp(pattern, 'i'); return (line: string) => re.test(line); })()
          : (line: string) => line.includes(pattern);
      } catch (err) {
        return {
          ok: false,
          summary: 'Invalid regex',
          feedback: `Invalid regex "${pattern}": ${err instanceof Error ? err.message : String(err)}`,
          error: 'bad-regex',
        };
      }
      let files = treeFiles();
      if (subPath) files = files.filter((f) => f.path.startsWith(subPath.replace(/^\/+/, '')));
      files = files.slice(0, SEARCH_MAX_FILES);

      const matches: string[] = [];
      outer: for (const file of files) {
        let content: string;
        try {
          content = await currentFileText(file);
        } catch {
          continue;
        }
        if (content.includes('')) continue; // skip binary-ish
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (matcher(lines[i])) {
            matches.push(`${file.path}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
            if (matches.length >= SEARCH_MAX_MATCHES) {
              matches.push('… (match limit reached)');
              break outer;
            }
          }
        }
      }
      return {
        ok: true,
        summary: `${matches.length} match${matches.length === 1 ? '' : 'es'} for "${pattern}"`,
        feedback: matches.join('\n') || `No matches for "${pattern}".`,
      };
    }

    case 'explain_selection': {
      const selection = useProjectStore.getState().selection;
      return {
        ok: true,
        summary: selection ? 'Selection attached' : 'No selection in editor',
        feedback: selection
          ? `User's current editor selection:\n${selection}`
          : 'The user has no selection in the editor right now. Ask them to select code, or use read_file.',
      };
    }

    default:
      return {
        ok: false,
        summary: `Unsupported tool "${call.tool}"`,
        feedback: `Tool "${call.tool}" is not executable here.`,
        error: 'bad-tool',
      };
  }
}

// --- write/edit previews + application --------------------------------------

/** Compute the approval preview for a write/edit call (does NOT modify files). */
export async function previewWriteCall(call: ParsedToolCall): Promise<WritePreview | ToolExecutionResult> {
  if (call.tool === 'write_file') {
    const path = arg(call, 'path');
    const content = arg(call, 'content');
    if (!path) return { ok: false, summary: 'Missing path', feedback: 'write_file needs "path" and "content".', error: 'bad-args' };
    const node = findFileByPath(path);
    if (node) {
      const oldContent = await currentFileText(node).catch(() => null);
      if (oldContent !== null) {
        const open = useProjectStore.getState().openFiles.find((f) => f.uri === node.uri);
        return {
          kind: 'diff',
          path: node.path,
          diff: computeLineDiff(oldContent, content),
          fullContent: content,
          conflictsWithOpenTab: open ? isDirty(open) : false,
        } satisfies WritePreview;
      }
    }
    return {
      kind: 'new-file',
      path: path.replace(/^\/+/, ''),
      newContentPreview: capContent(content, 3_000),
      fullContent: content,
      conflictsWithOpenTab: false,
    } satisfies WritePreview;
  }

  if (call.tool === 'edit_file') {
    const path = arg(call, 'path');
    const oldText = arg(call, 'old_text');
    const newText = arg(call, 'new_text');
    const node = findFileByPath(path);
    if (!node) {
      return { ok: false, summary: `Not found: ${path}`, feedback: `File not found: ${path}. Read the file first to get the exact path.`, error: 'file-not-found' };
    }
    const content = await currentFileText(node);
    const replaceAll = call.args.replace_all === true;
    if (!content.includes(oldText)) {
      return {
        ok: false,
        summary: 'old_text not found',
        feedback: `edit_file failed: old_text does not appear in ${node.path}. Re-read the file and match the text EXACTLY (including indentation).`,
        error: 'no-match',
      };
    }
    const occurrences = content.split(oldText).length - 1;
    if (occurrences > 1 && !replaceAll) {
      return {
        ok: false,
        summary: `old_text matches ${occurrences} places`,
        feedback: `edit_file failed: old_text appears ${occurrences} times in ${node.path}. Add more surrounding context to make it unique, or set replace_all=true.`,
        error: 'ambiguous',
      };
    }
    const updated = replaceAll ? content.split(oldText).join(newText) : content.replace(oldText, newText);
    const open = useProjectStore.getState().openFiles.find((f) => f.uri === node.uri);
    return {
      kind: 'diff',
      path: node.path,
      diff: computeLineDiff(content, updated),
      fullContent: updated,
      conflictsWithOpenTab: open ? isDirty(open) : false,
    } satisfies WritePreview;
  }

  return {
    ok: false,
    summary: `Unsupported tool "${call.tool}"`,
    feedback: `Tool "${call.tool}" cannot write files.`,
    error: 'bad-tool',
  };
}

/** Apply an approved write/edit. Syncs the editor tab when the file is open. */
export async function applyWriteCall(
  call: ParsedToolCall,
  preview: WritePreview,
): Promise<ToolExecutionResult> {
  const state = useProjectStore.getState();
  const node = findFileByPath(preview.path);

  try {
    if (node) {
      const open = state.openFiles.find((f) => f.uri === node.uri);
      if (open) {
        // Write-through via the store so the editor updates in place.
        state.updateContent(node.uri, preview.fullContent);
        await state.saveFile(node.uri);
        const saveError = useProjectStore.getState().error;
        if (saveError) throw new Error(saveError);
      } else {
        await projectFS.writeFile(node.uri, preview.fullContent);
      }
      const label = call.tool === 'edit_file' ? 'Edited' : 'Replaced';
      return {
        ok: true,
        summary: `${label} ${node.path}`,
        feedback: `User APPROVED and applied your ${call.tool} on ${node.path}. The file now contains the updated content.`,
        firstChangedLine: firstChangedLineFromDiff(preview.diff),
      };
    }

    // New file
    if (!projectFS.createFile) {
      return {
        ok: false,
        summary: 'Create unsupported',
        feedback: 'Creating new files is not supported for this project source. Ask the user to create the file, then use edit_file.',
        error: 'unsupported',
      };
    }
    const created = await projectFS.createFile(preview.path, preview.fullContent);
    await useProjectStore.getState().refreshTree();
    return {
      ok: true,
      summary: `Created ${created.path}`,
      feedback: `User APPROVED and created ${created.path} with your content.`,
      firstChangedLine: 1,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      summary: `Write failed: ${message}`,
      feedback: `Applying the change failed: ${message}`,
      error: message,
    };
  }
}
