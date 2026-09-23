/**
 * Checkpoint store (Slice 2, §9.10 of masterprompt).
 *
 * A checkpoint is an immutable snapshot of a set of file contents taken
 * *before* an agent write batch or destructive action. They form a ring
 * buffer (keep the last N, prune older). Reverting to a checkpoint is
 * itself reversible — the current state is snapshotted first.
 *
 * Pure logic: no React, no FS. The store layer (checkpointStore.ts)
 * persists to AsyncStorage; this module owns the snapshot math.
 */

export interface Checkpoint {
  id: string;
  /** When the checkpoint was created (epoch ms). */
  ts: number;
  /** Human label — reason for the checkpoint. */
  reason: string;
  /** 'user' | 'agent' | 'scm'. */
  author: 'user' | 'agent' | 'scm';
  /** Map of file path → captured content at checkpoint time. */
  files: Record<string, string>;
}

export interface CheckpointDiff {
  path: string;
  /** true when the path exists only in `before` (file was deleted after). */
  deleted: boolean;
  /** true when the path exists only in `after` (file was created since). */
  added: boolean;
  before: string;
  after: string;
}

export const DEFAULT_RING_SIZE = 20;

let checkpointCounter = 0;

export function makeCheckpointId(): string {
  checkpointCounter += 1;
  return `cp-${Date.now().toString(36)}-${checkpointCounter}`;
}

/**
 * Insert a checkpoint into a ring buffer, trimming from the oldest end.
 * Order is preserved (oldest → newest); the newest is always the last entry.
 */
export function pushCheckpoint(
  buffer: Checkpoint[],
  next: Checkpoint,
  ringSize: number = DEFAULT_RING_SIZE,
): Checkpoint[] {
  const out = [...buffer, next];
  if (out.length > ringSize) {
    out.splice(0, out.length - ringSize);
  }
  return out;
}

/** Reverting to `target` first snapshots the current state so the undo is reversible. */
export function revertToCheckpoint(
  buffer: Checkpoint[],
  targetId: string,
  currentFiles: Record<string, string>,
  ringSize: number = DEFAULT_RING_SIZE,
): { buffer: Checkpoint[]; restoredFiles: Record<string, string> } {
  const target = buffer.find((c) => c.id === targetId);
  if (!target) {
    return { buffer, restoredFiles: currentFiles };
  }
  // Snapshot the pre-revert state as a new checkpoint (itself reversible).
  const preRevert: Checkpoint = {
    id: makeCheckpointId(),
    ts: Date.now(),
    reason: `pre-revert (before reverting to ${target.reason})`,
    author: 'user',
    files: { ...currentFiles },
  };
  return {
    buffer: pushCheckpoint(buffer, preRevert, ringSize),
    restoredFiles: { ...target.files },
  };
}

/** Diff two file snapshots (before → after) into per-file hunks. */
export function diffSnapshots(
  before: Record<string, string>,
  after: Record<string, string>,
): CheckpointDiff[] {
  const paths = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  const out: CheckpointDiff[] = [];
  for (const path of paths) {
    const hasBefore = Object.prototype.hasOwnProperty.call(before, path);
    const hasAfter = Object.prototype.hasOwnProperty.call(after, path);
    if (hasBefore && hasAfter) {
      const b = before[path];
      const a = after[path];
      if (b !== a) out.push({ path, deleted: false, added: false, before: b, after: a });
    } else if (hasBefore && !hasAfter) {
      out.push({ path, deleted: true, added: false, before: before[path], after: '' });
    } else if (!hasBefore && hasAfter) {
      out.push({ path, deleted: false, added: true, before: '', after: after[path] });
    }
  }
  // Stable ordering: by path, deletions first then additions, to match the
  // Review sheet's expectation of a deterministic list.
  out.sort((x, y) => {
    if (x.path !== y.path) return x.path < y.path ? -1 : 1;
    if (x.added !== y.added) return x.added ? 1 : -1;
    return 0;
  });
  return out;
}

/**
 * Count added/removed lines for a single file diff. Used for the per-file
 * "+12 −3" stat chips in the Review sheet.
 */
export function diffLineStats(diff: CheckpointDiff): { added: number; removed: number } {
  // A whole-file add/delete is counted as every line added/removed; a
  // modification counts only the lines that actually differ (approximate,
  // LCS-free — good enough for the "+12 −3" stat chips).
  if (diff.added) {
    return { added: diff.after ? diff.after.split('\n').length : 0, removed: 0 };
  }
  if (diff.deleted) {
    return { added: 0, removed: diff.before ? diff.before.split('\n').length : 0 };
  }
  const beforeLines = diff.before ? diff.before.split('\n') : [];
  const afterLines = diff.after ? diff.after.split('\n') : [];
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  let removed = 0;
  let added = 0;
  for (const l of beforeLines) {
    if (!afterSet.has(l)) removed += 1;
  }
  for (const l of afterLines) {
    if (!beforeSet.has(l)) added += 1;
  }
  return { added, removed };
}

/**
 * Merge a set of per-file overrides (the user's accept/reject decisions) on
 * top of a target snapshot. Paths not mentioned in `overrides` keep their
 * target content. This is the `DiffApplyPlan` of §16.
 */
export function applyDecisions(
  target: Record<string, string>,
  overrides: Record<string, string | null>,
): Record<string, string> {
  const out: Record<string, string> = { ...target };
  for (const [path, content] of Object.entries(overrides)) {
    if (content === null) {
      // null sentinel = delete the file.
      delete out[path];
    } else {
      out[path] = content;
    }
  }
  return out;
}
