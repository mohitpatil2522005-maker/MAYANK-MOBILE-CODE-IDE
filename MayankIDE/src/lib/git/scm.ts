/**
 * Git source-control model (Slice 4, §6.3–6.4 of the masterprompt).
 *
 * Pure logic: computes a three-group view (staged / unstaged / untracked)
 * from a status snapshot, and validates commit messages. No real git
 * execution here — the platform git adapter (isomorphic-git) supplies the
 * snapshot; this module turns it into the UI's data shape.
 */

export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'conflict';

export interface GitFileEntry {
  path: string;
  status: GitFileStatus;
  staged: boolean;
  /** Per-file diff stats when known. */
  added?: number;
  removed?: number;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string;
  ahead: number;
  behind: number;
  files: GitFileEntry[];
}

export interface ScmGroups {
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  untracked: GitFileEntry[];
}

/** Split the flat file list into the three SCM groups VS Code uses. */
export function groupFiles(files: GitFileEntry[]): ScmGroups {
  const out: ScmGroups = { staged: [], unstaged: [], untracked: [] };
  for (const f of files) {
    if (f.status === 'untracked') {
      out.untracked.push(f);
    } else if (f.staged) {
      out.staged.push(f);
    } else {
      out.unstaged.push(f);
    }
  }
  const byPath = (a: GitFileEntry, b: GitFileEntry) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  out.staged.sort(byPath);
  out.unstaged.sort(byPath);
  out.untracked.sort(byPath);
  return out;
}

export function diffStatLabel(f: GitFileEntry): string | null {
  if (f.added === undefined && f.removed === undefined) return null;
  return `+${f.added ?? 0} −${f.removed ?? 0}`;
}

export interface CommitValidation {
  ok: boolean;
  error?: string;
}

const MIN_MESSAGE = 1;
const MAX_MESSAGE = 20_000;

/** Validate a commit message (empty + over-length are rejected). */
export function validateCommitMessage(msg: string): CommitValidation {
  const t = msg.trim();
  if (t.length < MIN_MESSAGE) return { ok: false, error: 'Commit message is required' };
  if (t.length > MAX_MESSAGE) return { ok: false, error: `Message is longer than ${MAX_MESSAGE} characters` };
  return { ok: true };
}

/** Suggest a conventional-commit prefix from the message (lowercase first word). */
export function commitTypePrefix(msg: string): string {
  // Strip a trailing ':' and any punctuation from the first token ("feat:" → "feat").
  const first = msg.trim().split(/\s+/)[0]?.toLowerCase().replace(/[:\-]+$/g, '') ?? '';
  const known = ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore', 'perf'];
  return known.includes(first) ? first : '';
}

/** Total changed lines across a set of files (for the commit summary chip). */
export function totalDiffStats(files: GitFileEntry[]): { added: number; removed: number; count: number } {
  let added = 0;
  let removed = 0;
  let count = 0;
  for (const f of files) {
    // Only files with known diff stats contribute to the count.
    if (f.added === undefined && f.removed === undefined) continue;
    added += f.added ?? 0;
    removed += f.removed ?? 0;
    count += 1;
  }
  return { added, removed, count };
}
