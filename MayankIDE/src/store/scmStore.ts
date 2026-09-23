/**
 * Source-control store (Slice 4) — in-memory SCM state bridging the panel and
 * (later) a real isomorphic-git adapter.
 *
 * The MVP builds the file list from the project's open-file dirty tracking
 * (modified = open tab with unsaved changes). Real git integration (clone,
 * commit, push) is wired to the platform git adapter in a later milestone;
 * this store is the single source of truth the panel renders.
 */
import { create } from 'zustand';

import {
  groupFiles,
  type GitFileEntry,
  type GitStatus,
} from '@/src/lib/git/scm';
import { isDirty, useProjectStore } from '@/src/store/projectStore';

interface ScmState {
  status: GitStatus;
  commitMessage: string;
  /** Rebuild the file list from the project store's open/dirty state. */
  refreshFromProject: () => void;
  stage: (path: string) => void;
  unstage: (path: string) => void;
  setCommitMessage: (msg: string) => void;
  /** Mark a commit as made: clears the message and removes staged files. */
  commit: () => void;
}

/** Build SCM entries from the project store (dirty open files = modified). */
function buildStatus(): GitStatus {
  const proj = useProjectStore.getState();
  const files: GitFileEntry[] = [];
  for (const f of proj.openFiles) {
    if (isDirty(f)) {
      files.push({ path: f.path, status: 'modified', staged: false });
    }
  }
  // Deduplicate (a path could be open more than once in theory).
  const seen = new Set<string>();
  const unique = files.filter((f) => (seen.has(f.path) ? false : (seen.add(f.path), true)));
  return {
    isRepo: Boolean(proj.rootUri),
    branch: 'main',
    ahead: 0,
    behind: 0,
    files: unique,
  };
}

export const useScmStore = create<ScmState>()((set, get) => ({
  status: { isRepo: false, branch: 'main', ahead: 0, behind: 0, files: [] },
  commitMessage: '',

  refreshFromProject() {
    set({ status: buildStatus() });
  },

  stage(path) {
    set((s) => ({
      status: {
        ...s.status,
        files: s.status.files.map((f) => (f.path === path ? { ...f, staged: true } : f)),
      },
    }));
  },

  unstage(path) {
    set((s) => ({
      status: {
        ...s.status,
        files: s.status.files.map((f) => (f.path === path ? { ...f, staged: false } : f)),
      },
    }));
  },

  setCommitMessage(msg) {
    set({ commitMessage: msg });
  },

  commit() {
    // MVP: clearing the staged set models "committed". A real adapter would
    // create the commit and clear the index; that is a later milestone.
    set((s) => ({
      commitMessage: '',
      status: {
        ...s.status,
        files: s.status.files.filter((f) => !f.staged),
      },
    }));
  },
}));

/** Convenience: the three groups for the panel, recomputed from status. */
export function scmGroups(): ReturnType<typeof groupFiles> {
  return groupFiles(useScmStore.getState().status.files);
}
