/**
 * Checkpoint store (Slice 2) — ring buffer persisted to AsyncStorage.
 *
 * Created automatically before every agent write batch (via toolExecutor)
 * and manually from the command palette / Review Changes sheet. Reverting
 * to a checkpoint first snapshots the current state so the action itself is
 * undoable (per §9.10).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  DEFAULT_RING_SIZE,
  diffSnapshots,
  makeCheckpointId,
  pushCheckpoint,
  revertToCheckpoint,
  type Checkpoint,
  type CheckpointDiff,
} from '@/src/lib/editor/checkpoint';
import { useProjectStore } from '@/src/store/projectStore';

const STORAGE_KEY = 'mayank-ide/checkpoints/v1';
const RING_SIZE = DEFAULT_RING_SIZE;

interface CheckpointState {
  checkpoints: Checkpoint[];
  loaded: boolean;

  load: () => Promise<void>;
  /** Snapshot the given files; ring-trim to RING_SIZE. */
  pushFromFiles: (
    files: Record<string, string>,
    reason: string,
    author: 'user' | 'agent' | 'scm',
  ) => void;
  /** Snapshot every open editor tab's current content (manual /palette "Create checkpoint"). */
  snapshotOpenTabs: (reason: string) => void;
  /** Diff a checkpoint against the current open tabs. */
  diffAgainstCurrent: (checkpointId: string) => CheckpointDiff[];
  /** Revert to a checkpoint: restorable file map (current state auto-snapshotted). */
  revertTo: (checkpointId: string) => { buffer: Checkpoint[]; restoredFiles: Record<string, string> };
  clear: () => void;
}

function serialise(checkpoints: Checkpoint[]): string {
  return JSON.stringify(checkpoints);
}

export const useCheckpointStore = create<CheckpointState>()((set, get) => ({
  checkpoints: [],
  loaded: false,

  async load() {
    if (get().loaded) return;
    set({ loaded: true });
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Checkpoint[];
        if (Array.isArray(parsed)) set({ checkpoints: parsed.slice(-RING_SIZE) });
      }
    } catch {
      // corrupt payload → start fresh
    }
  },

  pushFromFiles(files, reason, author) {
    const next: Checkpoint = {
      id: makeCheckpointId(),
      ts: Date.now(),
      reason,
      author,
      files,
    };
    set((s) => {
      const checkpoints = pushCheckpoint(s.checkpoints, next, RING_SIZE);
      void AsyncStorage.setItem(STORAGE_KEY, serialise(checkpoints)).catch(() => undefined);
      return { checkpoints };
    });
  },

  snapshotOpenTabs(reason) {
    const open = useProjectStore.getState().openFiles;
    if (open.length === 0) return;
    const files: Record<string, string> = {};
    for (const f of open) files[f.path] = f.content;
    get().pushFromFiles(files, reason, 'user');
  },

  diffAgainstCurrent(checkpointId) {
    const cp = get().checkpoints.find((c) => c.id === checkpointId);
    if (!cp) return [];
    const current: Record<string, string> = {};
    for (const f of useProjectStore.getState().openFiles) current[f.path] = f.content;
    return diffSnapshots(cp.files, current);
  },

  revertTo(checkpointId) {
    const { openFiles, updateContent } = useProjectStore.getState();
    const current: Record<string, string> = {};
    for (const f of openFiles) current[f.path] = f.content;
    const result = revertToCheckpoint(get().checkpoints, checkpointId, current, RING_SIZE);
    const buffer = result.buffer;
    const restoredFiles = result.restoredFiles;
    // Sync restored content into any still-open tabs (the pure function only
    // returns the map; the store mutates the editor).
    for (const [path, content] of Object.entries(restoredFiles)) {
      const open = openFiles.find((f) => f.path === path);
      if (open) updateContent(open.uri, content);
    }
    set(() => {
      void AsyncStorage.setItem(STORAGE_KEY, serialise(buffer)).catch(() => undefined);
      return { checkpoints: buffer };
    });
    return { buffer, restoredFiles };
  },

  clear() {
    set({ checkpoints: [] });
    void AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  },
}));

// Hydrate on first import so the UI can read the ring buffer synchronously.
void useCheckpointStore.getState().load();
