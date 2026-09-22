/**
 * Native (iOS/Android) project filesystem.
 *
 * - Android: Storage Access Framework — user picks any folder, we get a
 *   persistable-ish content:// tree URI (persistable permissions are not yet
 *   exposed by expo-file-system, so restore can fail after reboot and the UI
 *   falls back to re-picking).
 * - iOS: expo-document-picker has no reliable folder mode, so for the MVP we
 *   use a sandbox folder inside the app's documents directory.
 * - demo:// URIs always resolve to the in-memory demo project.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import {
  createDemoFile,
  createDemoProject,
  isDemoUri,
  readDemoFile,
  writeDemoFile,
} from './demoProject';
import type { FileNode, PickedProject, ProjectFS } from './types';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.expo',
  'dist',
  'build',
  '.next',
  '__pycache__',
  '.idea',
  'coverage',
  'target',
  'out',
]);
const MAX_FILES = 600;
const MAX_DEPTH = 8;

/** Name extraction for SAF content:// URIs (URL-encoded, "primary:path/name" form). */
function safName(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const last = decoded.split('/').pop() ?? decoded;
  const afterColon = last.includes(':') ? last.split(':').pop() ?? last : last;
  return afterColon || 'project';
}

interface ChildEntry {
  uri: string;
  name: string;
}

/** List children of a directory, for both content:// (SAF) and file:// URIs. */
async function listChildren(dirUri: string): Promise<ChildEntry[]> {
  if (dirUri.startsWith('content://')) {
    const uris = await FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri);
    return uris.map((uri) => ({ uri, name: safName(uri) }));
  }
  const names = await FileSystem.readDirectoryAsync(dirUri);
  const base = dirUri.endsWith('/') ? dirUri : dirUri + '/';
  return names.map((name) => ({ uri: base + name, name }));
}

/** Directories: listable; files throw when we try to list them. */
async function tryList(entry: ChildEntry): Promise<ChildEntry[] | null> {
  try {
    return await listChildren(entry.uri);
  } catch {
    return null;
  }
}

async function scanDir(
  dirUri: string,
  rel: string,
  depth: number,
  budget: { count: number },
): Promise<FileNode[]> {
  if (depth > MAX_DEPTH || budget.count >= MAX_FILES) return [];
  let children: ChildEntry[];
  try {
    children = await listChildren(dirUri);
  } catch {
    return [];
  }
  children.sort((a, b) => a.name.localeCompare(b.name));

  const dirs: FileNode[] = [];
  const files: FileNode[] = [];
  for (const child of children) {
    if (budget.count >= MAX_FILES) {
      files.push({
        uri: child.uri,
        name: `… (scan limit of ${MAX_FILES} files reached)`,
        path: rel,
        type: 'file',
        truncated: true,
      });
      break;
    }
    const childRel = rel ? `${rel}/${child.name}` : child.name;
    const listing = await tryList(child);
    if (listing !== null) {
      if (SKIP_DIRS.has(child.name)) continue;
      budget.count += 1;
      dirs.push({
        uri: child.uri,
        name: child.name,
        path: childRel,
        type: 'directory',
        children: await scanDir(child.uri, childRel, depth + 1, budget),
      });
    } else {
      budget.count += 1;
      files.push({ uri: child.uri, name: child.name, path: childRel, type: 'file' });
    }
  }
  return [...dirs, ...files];
}

async function scanProject(rootUri: string, name: string): Promise<PickedProject> {
  const tree = await scanDir(rootUri, '', 0, { count: 0 });
  return { name, rootUri, tree };
}

/** Directory displayed in the Android picker result. */
function projectNameFromRoot(rootUri: string): string {
  if (rootUri.startsWith('content://')) return safName(rootUri);
  const trimmed = rootUri.replace(/\/+$/, '');
  return decodeURIComponent(trimmed.split('/').pop() ?? 'project');
}

export const projectFS: ProjectFS = {
  async pickProject(): Promise<PickedProject | null> {
    if (Platform.OS === 'ios') {
      // MVP: document picker has no folder mode on iOS → sandboxed demo project.
      const root = `${FileSystem.documentDirectory}projects/demo/`;
      const info = await FileSystem.getInfoAsync(root);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(root, { intermediates: true });
        const demo = createDemoProject();
        await Promise.all(
          flattenUris(demo.tree)
            .filter((n) => n.type === 'file')
            .map(async (n) => {
              const target = root + n.path;
              await FileSystem.makeDirectoryAsync(target.slice(0, target.lastIndexOf('/') + 1), {
                intermediates: true,
              }).catch(() => undefined);
              await FileSystem.writeAsStringAsync(target, readDemoFile(n.uri));
            }),
        );
      }
      _setProjectRoot(root);
      return scanProject(root, 'demo-project');
    }

    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return null;
    _setProjectRoot(permission.directoryUri);
    return scanProject(permission.directoryUri, projectNameFromRoot(permission.directoryUri));
  },

  async restoreProject(rootUri: string): Promise<PickedProject | null> {
    if (isDemoUri(rootUri)) {
      _setProjectRoot(rootUri);
      return createDemoProject(true);
    }
    try {
      const project = await scanProject(rootUri, projectNameFromRoot(rootUri));
      _setProjectRoot(rootUri);
      return project;
    } catch {
      return null; // SAF permission lost, folder moved, etc. → caller re-picks.
    }
  },

  async readFile(uri: string): Promise<string> {
    if (isDemoUri(uri)) return readDemoFile(uri);
    return FileSystem.readAsStringAsync(uri);
  },

  async writeFile(uri: string, content: string): Promise<void> {
    if (isDemoUri(uri)) {
      writeDemoFile(uri, content);
      return;
    }
    await FileSystem.writeAsStringAsync(uri, content);
  },

  async createFile(relativePath: string, content: string): Promise<FileNode> {
    const rel = relativePath.replace(/^\/+/, '');
    if (!rel) throw new Error('Empty file path');
    const name = rel.split('/').pop() ?? rel;

    if (lastRootIsDemo()) return createDemoFile(rel, content);
    const rootUri = lastRootUri();
    if (!rootUri) throw new Error('No project open');

    if (rootUri.startsWith('content://')) {
      // SAF: walk/create the directory chain, then create the document.
      const segments = rel.split('/');
      const fileName = segments.pop() ?? rel;
      let dirUri = rootUri;
      for (const segment of segments) {
        const existing = await listChildren(dirUri);
        const match = existing.find((c) => c.name === segment);
        if (match) {
          dirUri = match.uri;
        } else {
          dirUri = await FileSystem.StorageAccessFramework.makeDirectoryAsync(dirUri, segment);
        }
      }
      const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        dirUri,
        fileName,
        'text/plain',
      );
      await FileSystem.writeAsStringAsync(fileUri, content);
      return { uri: fileUri, name: fileName, path: rel, type: 'file' };
    }

    // Plain filesystem (iOS sandbox).
    const target = (rootUri.endsWith('/') ? rootUri : rootUri + '/') + rel;
    await FileSystem.makeDirectoryAsync(target.slice(0, target.lastIndexOf('/') + 1), {
      intermediates: true,
    }).catch(() => undefined);
    await FileSystem.writeAsStringAsync(target, content);
    return { uri: target, name, path: rel, type: 'file' };
  },
};

/** Root tracking for createFile (the FS layer itself is stateless otherwise). */
let currentRootUri: string | null = null;
function lastRootUri(): string | null {
  return currentRootUri;
}
function lastRootIsDemo(): boolean {
  return currentRootUri !== null && isDemoUri(currentRootUri);
}
export function _setProjectRoot(uri: string | null): void {
  currentRootUri = uri;
}

function flattenUris(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  const walk = (n: FileNode) => {
    out.push(n);
    n.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}
