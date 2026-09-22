/**
 * Project state: opened folder, file tree, open tabs, dirty tracking, saving.
 * Filesystem access goes through the platform ProjectFS implementation.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import { create } from 'zustand';

import { languageFromFilename, type LanguageId } from '@/src/lib/editor/languages';
import { createDemoProject } from '@/src/lib/fs/demoProject';
import { projectFS } from '@/src/lib/fs/projectFs';
import type { FileNode } from '@/src/lib/fs/types';
import { useSettingsStore } from '@/src/store/settingsStore';

const LAST_PROJECT_KEY = 'codeforge/lastProjectUri/v1';

export interface OpenFile {
  uri: string;
  name: string;
  path: string;
  language: LanguageId;
  content: string;
  /** Last saved content — dirty when content !== savedContent. */
  savedContent: string;
}

interface ProjectState {
  projectName: string | null;
  rootUri: string | null;
  tree: FileNode[];
  openFiles: OpenFile[];
  activeUri: string | null;
  isOpeningProject: boolean;
  isSaving: boolean;
  error: string | null;
  /** Current editor selection text (null when empty), for agent quick actions. */
  selection: string | null;

  openProject: () => Promise<void>;
  openDemoProject: () => void;
  /** Restore the last project on app start. Silent when nothing to restore. */
  restoreLastProject: () => Promise<void>;
  closeProject: () => Promise<void>;
  /** Re-scan the project tree (after external changes, e.g. agent file writes). */
  refreshTree: () => Promise<void>;

  openFile: (node: FileNode) => Promise<void>;
  activateFile: (uri: string) => void;
  closeFile: (uri: string) => Promise<void>;
  /** Swap a tab one position left/right (VS Code tab reorder). */
  moveTab: (uri: string, delta: -1 | 1) => void;
  updateContent: (uri: string, content: string) => void;
  saveFile: (uri?: string) => Promise<void>;
  setSelection: (text: string | null) => void;
  clearError: () => void;
}

export function isDirty(file: OpenFile): boolean {
  return file.content !== file.savedContent;
}

/** Debounce timers for auto-save, keyed by uri. */
const autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleAutoSave(uri: string, save: (uri?: string) => Promise<void>): void {
  const existing = autoSaveTimers.get(uri);
  if (existing) clearTimeout(existing);
  autoSaveTimers.set(
    uri,
    setTimeout(() => {
      autoSaveTimers.delete(uri);
      void save(uri);
    }, 900),
  );
}

function fileNodes(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  const walk = (n: FileNode) => {
    if (n.type === 'file' && !n.truncated) out.push(n);
    n.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

async function confirmDiscardChanges(fileName: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const g = globalThis as { confirm?: (msg: string) => boolean };
    return typeof g.confirm === 'function'
      ? g.confirm(`"${fileName}" has unsaved changes. Close anyway?`)
      : true;
  }
  return new Promise((resolve) => {
    Alert.alert('Unsaved changes', `"${fileName}" has unsaved changes. Close anyway?`, [
      { text: 'Keep editing', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Discard', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projectName: null,
  rootUri: null,
  tree: [],
  openFiles: [],
  activeUri: null,
  isOpeningProject: false,
  isSaving: false,
  error: null,
  selection: null,

  async openProject() {
    set({ isOpeningProject: true, error: null });
    try {
      const picked = await projectFS.pickProject();
      if (!picked) {
        set({ isOpeningProject: false });
        return;
      }
      set({
        projectName: picked.name,
        rootUri: picked.rootUri,
        tree: picked.tree,
        openFiles: [],
        activeUri: null,
        isOpeningProject: false,
      });
      await AsyncStorage.setItem(LAST_PROJECT_KEY, picked.rootUri).catch(() => undefined);
    } catch (err) {
      set({
        isOpeningProject: false,
        error: `Couldn't open folder: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  openDemoProject() {
    const demo = createDemoProject();
    set({
      projectName: demo.name,
      rootUri: demo.rootUri,
      tree: demo.tree,
      openFiles: [],
      activeUri: null,
      error: null,
    });
    void AsyncStorage.setItem(LAST_PROJECT_KEY, demo.rootUri).catch(() => undefined);
  },

  async restoreLastProject() {
    if (get().rootUri) return; // a project is already open
    const lastUri = await AsyncStorage.getItem(LAST_PROJECT_KEY).catch(() => null);
    if (!lastUri) return;
    set({ isOpeningProject: true });
    const restored = await projectFS.restoreProject(lastUri);
    if (restored) {
      set({
        projectName: restored.name,
        rootUri: restored.rootUri,
        tree: restored.tree,
        openFiles: [],
        activeUri: null,
        isOpeningProject: false,
      });
    } else {
      await AsyncStorage.removeItem(LAST_PROJECT_KEY).catch(() => undefined);
      set({ isOpeningProject: false });
    }
  },

  async closeProject() {
    const state = get();
    const dirty = state.openFiles.find(isDirty);
    if (dirty && !(await confirmDiscardChanges(dirty.name))) return;
    autoSaveTimers.forEach((t) => clearTimeout(t));
    autoSaveTimers.clear();
    set({
      projectName: null,
      rootUri: null,
      tree: [],
      openFiles: [],
      activeUri: null,
      selection: null,
    });
    await AsyncStorage.removeItem(LAST_PROJECT_KEY).catch(() => undefined);
  },

  async refreshTree() {
    const { rootUri } = get();
    if (!rootUri) return;
    try {
      const restored = await projectFS.restoreProject(rootUri);
      if (restored) set({ tree: restored.tree });
    } catch {
      // keep the existing tree on scan failure
    }
  },

  async openFile(node) {
    if (node.type !== 'file' || node.truncated) return;
    const existing = get().openFiles.find((f) => f.uri === node.uri);
    if (existing) {
      set({ activeUri: node.uri });
      return;
    }
    try {
      const content = await projectFS.readFile(node.uri);
      const file: OpenFile = {
        uri: node.uri,
        name: node.name,
        path: node.path,
        language: languageFromFilename(node.name),
        content,
        savedContent: content,
      };
      set((s) => ({ openFiles: [...s.openFiles, file], activeUri: node.uri }));
    } catch (err) {
      set({ error: `Couldn't read ${node.path}: ${err instanceof Error ? err.message : String(err)}` });
    }
  },

  activateFile(uri) {
    if (get().openFiles.some((f) => f.uri === uri)) set({ activeUri: uri });
  },

  async closeFile(uri) {
    const file = get().openFiles.find((f) => f.uri === uri);
    if (!file) return;
    if (isDirty(file) && !(await confirmDiscardChanges(file.name))) return;
    const timer = autoSaveTimers.get(uri);
    if (timer) {
      clearTimeout(timer);
      autoSaveTimers.delete(uri);
    }
    set((s) => {
      const openFiles = s.openFiles.filter((f) => f.uri !== uri);
      const activeUri =
        s.activeUri === uri ? (openFiles.length > 0 ? openFiles[openFiles.length - 1].uri : null) : s.activeUri;
      return { openFiles, activeUri };
    });
  },

  moveTab(uri, delta) {
    set((s) => {
      const index = s.openFiles.findIndex((f) => f.uri === uri);
      const target = index + delta;
      if (index === -1 || target < 0 || target >= s.openFiles.length) return s;
      const openFiles = [...s.openFiles];
      [openFiles[index], openFiles[target]] = [openFiles[target], openFiles[index]];
      return { openFiles };
    });
  },

  updateContent(uri, content) {
    set((s) => ({
      openFiles: s.openFiles.map((f) => (f.uri === uri ? { ...f, content } : f)),
    }));
    if (useSettingsStore.getState().autoSave) {
      scheduleAutoSave(uri, get().saveFile);
    }
  },

  async saveFile(uri) {
    const targetUri = uri ?? get().activeUri;
    if (!targetUri) return;
    const file = get().openFiles.find((f) => f.uri === targetUri);
    if (!file || !isDirty(file)) return;
    set({ isSaving: true });
    try {
      await projectFS.writeFile(targetUri, file.content);
      set((s) => ({
        isSaving: false,
        openFiles: s.openFiles.map((f) =>
          f.uri === targetUri ? { ...f, savedContent: f.content } : f,
        ),
      }));
    } catch (err) {
      set({
        isSaving: false,
        error: `Couldn't save ${file.path}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  setSelection(text) {
    set({ selection: text && text.length > 0 ? text : null });
  },

  clearError() {
    set({ error: null });
  },
}));

/** Flat list of all files in the tree (used later by the agent in Phase 3). */
export function allProjectFiles(tree: FileNode[]): FileNode[] {
  return fileNodes(tree);
}
