/**
 * Web project filesystem.
 *
 * - Chromium browsers: File System Access API (`showDirectoryPicker`) with
 *   read/write. Handles are kept in memory for the session (IndexedDB
 *   persistence is a post-MVP enhancement, so restore returns null for now).
 * - Other browsers: falls back to the in-memory demo project.
 */
import {
  createDemoFile,
  createDemoProject,
  isDemoRootActive,
  isDemoUri,
  readDemoFile,
  writeDemoFile,
} from './demoProject';
import type { FileNode, PickedProject, ProjectFS } from './types';

// --- Minimal File System Access typings (kept local to avoid DOM lib coupling) ---
interface WebWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
interface WebFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<WebWritable>;
}
interface WebDirectoryHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<WebFileHandle | WebDirectoryHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<WebDirectoryHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<WebFileHandle>;
}
type WebHandle = WebFileHandle | WebDirectoryHandle;

interface WebWindow {
  showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<WebDirectoryHandle>;
}

function webWindow(): WebWindow | null {
  return (globalThis as { window?: WebWindow }).window ?? null;
}

const WEB_SCHEME = 'webfs://';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.expo',
  'dist',
  'build',
  '.next',
  '__pycache__',
  'coverage',
  'target',
  'out',
]);
const MAX_FILES = 600;
const MAX_DEPTH = 8;

/** Session-scoped handle registry: uri → handle. */
const handles = new Map<string, WebHandle>();
/** Root directory handle of the picked project (for restore + createFile). */
let rootHandle: WebDirectoryHandle | null = null;
/** True while the in-memory demo project is the active root. */
let demoActive = false;

function lastRootIsDemoWeb(): boolean {
  return demoActive;
}

async function scanWebDir(
  dir: WebDirectoryHandle,
  rel: string,
  depth: number,
  budget: { count: number },
): Promise<FileNode[]> {
  if (depth > MAX_DEPTH || budget.count >= MAX_FILES) return [];
  const dirs: FileNode[] = [];
  const files: FileNode[] = [];
  for await (const handle of dir.values()) {
    if (budget.count >= MAX_FILES) {
      files.push({
        uri: WEB_SCHEME + rel,
        name: `… (scan limit of ${MAX_FILES} files reached)`,
        path: rel,
        type: 'file',
        truncated: true,
      });
      break;
    }
    const childRel = rel ? `${rel}/${handle.name}` : handle.name;
    const uri = WEB_SCHEME + childRel;
    budget.count += 1;
    if (handle.kind === 'directory') {
      if (SKIP_DIRS.has(handle.name)) continue;
      handles.set(uri, handle);
      dirs.push({
        uri,
        name: handle.name,
        path: childRel,
        type: 'directory',
        children: await scanWebDir(handle, childRel, depth + 1, budget),
      });
    } else {
      handles.set(uri, handle);
      files.push({ uri, name: handle.name, path: childRel, type: 'file' });
    }
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export const projectFS: ProjectFS = {
  async pickProject(): Promise<PickedProject | null> {
    const w = webWindow();
    if (!w?.showDirectoryPicker) {
      // Unsupported browser → demo project keeps the app usable.
      demoActive = true;
      return createDemoProject();
    }
    let root: WebDirectoryHandle;
    try {
      root = await w.showDirectoryPicker({ mode: 'readwrite' });
    } catch (err) {
      if (isAbortError(err)) return null; // user cancelled
      throw err;
    }
    handles.clear();
    demoActive = false;
    rootHandle = root;
    const tree = await scanWebDir(root, '', 0, { count: 0 });
    return { name: root.name, rootUri: WEB_SCHEME, tree };
  },

  async restoreProject(rootUri: string): Promise<PickedProject | null> {
    if (isDemoUri(rootUri)) {
      demoActive = true;
      return createDemoProject(true);
    }
    // Handles survive only for the session (IndexedDB persistence is post-MVP).
    if (rootUri === WEB_SCHEME && rootHandle) {
      demoActive = false;
      const tree = await scanWebDir(rootHandle, '', 0, { count: 0 });
      return { name: rootHandle.name, rootUri: WEB_SCHEME, tree };
    }
    return null;
  },

  async createFile(relativePath: string, content: string): Promise<FileNode> {
    const rel = relativePath.replace(/^\/+/, '');
    if (!rel) throw new Error('Empty file path');
    if (isDemoRootActive() || lastRootIsDemoWeb()) return createDemoFile(rel, content);
    if (!rootHandle) throw new Error('No project open');
    const segments = rel.split('/');
    const fileName = segments.pop() ?? rel;
    let dir = rootHandle;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment, { create: true });
    }
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    const uri = WEB_SCHEME + rel;
    handles.set(uri, fileHandle);
    return { uri, name: fileName, path: rel, type: 'file' };
  },

  async readFile(uri: string): Promise<string> {
    if (isDemoUri(uri)) return readDemoFile(uri);
    const handle = handles.get(uri);
    if (!handle || handle.kind !== 'file') throw new Error(`File not open: ${uri}`);
    const file = await handle.getFile();
    return file.text();
  },

  async writeFile(uri: string, content: string): Promise<void> {
    if (isDemoUri(uri)) {
      writeDemoFile(uri, content);
      return;
    }
    const handle = handles.get(uri);
    if (!handle || handle.kind !== 'file') throw new Error(`File not open: ${uri}`);
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  },
};
