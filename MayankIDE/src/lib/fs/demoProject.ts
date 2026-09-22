/**
 * In-memory demo project — showcases the editor on every platform without
 * needing folder permissions (also the fallback on web/iOS sandbox).
 * Files live only in memory; edits are lost when the app restarts.
 */
import type { FileNode, PickedProject } from './types';

export const DEMO_ROOT = 'demo://';
export const DEMO_PROJECT_NAME = 'demo-project';

/**
 * True while the demo project is the active root. The in-memory demo is
 * opened directly by projectStore (no picker), so the platform FS layers
 * need this shared flag to route createFile/read/write to demo memory.
 */
let demoRootActive = false;
export function setDemoRootActive(active: boolean): void {
  demoRootActive = active;
}
export function isDemoRootActive(): boolean {
  return demoRootActive;
}

const DEMO_FILES: Record<string, string> = {
  'README.md': `# Demo Project

Welcome to **Mayank IDE**! 🎉

This in-memory project lets you try the editor without granting folder access.

## Phase 1 — what works today
- File tree, tabs, syntax highlighting (dark/light)
- Edit + save (Ctrl/Cmd+S), auto-save option
- Vim mode toggle in Settings

## Coming next
- Phase 2: AI provider layer (OpenAI, Anthropic, Google, Groq, custom endpoints)
- Phase 3: Forge agent chat with tool approvals
- Phase 4: Provider management UI

Open \`src/index.ts\` to start hacking.
`,
  'src/index.ts': `import { greet } from './greeter';

const names = ['Mayank', 'Forge', 'Mobile'];

for (const name of names) {
  console.log(greet(name));
}

// Try editing me, then save with Ctrl/Cmd+S.
export const VERSION = '0.1.0-phase1';
`,
  'src/greeter.ts': `/** Returns a friendly greeting. */
export function greet(name: string): string {
  return \`Hello, \${name}! Welcome to Mayank IDE.\`;
}
`,
  'scripts/hello.py': `"""Tiny Python sample to show syntax highlighting."""


def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a


if __name__ == "__main__":
    for i in range(10):
        print(f"fib({i}) = {fib(i)}")
`,
  'config/app.json': `{
  "name": "demo-project",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "start": "node src/index.ts"
  }
}
`,
};

/** Mutable in-memory copy of the demo files. */
const memory = new Map<string, string>(Object.entries(DEMO_FILES));

export function isDemoUri(uri: string): boolean {
  return uri.startsWith(DEMO_ROOT);
}

/** Load (or reload) the demo project. `restore` keeps previous in-memory edits. */
export function createDemoProject(restore = false): PickedProject {
  if (!restore) {
    memory.clear();
    for (const [k, v] of Object.entries(DEMO_FILES)) memory.set(k, v);
  }
  return { name: DEMO_PROJECT_NAME, rootUri: DEMO_ROOT, tree: buildTree() };
}

export function readDemoFile(uri: string): string {
  const key = uri.slice(DEMO_ROOT.length);
  const content = memory.get(key);
  if (content === undefined) throw new Error(`Demo file not found: ${key}`);
  return content;
}

export function writeDemoFile(uri: string, content: string): void {
  const key = uri.slice(DEMO_ROOT.length);
  if (!memory.has(key)) throw new Error(`Demo file not found: ${key}`);
  memory.set(key, content);
}

/** Create a new in-memory demo file (used by the agent's write_file tool). */
export function createDemoFile(relativePath: string, content: string): FileNode {
  const rel = relativePath.replace(/^\/+/, '');
  if (!rel) throw new Error('Empty file path');
  memory.set(rel, content);
  const name = rel.split('/').pop() ?? rel;
  return { uri: DEMO_ROOT + rel, name, path: rel, type: 'file' };
}

/** Build the file tree from the in-memory map. */
function buildTree(): FileNode[] {
  const root: FileNode = {
    uri: DEMO_ROOT,
    name: DEMO_PROJECT_NAME,
    path: '',
    type: 'directory',
    children: [],
  };
  const dirs = new Map<string, FileNode>([['', root]]);

  const ensureDir = (rel: string, parentRel: string, name: string): FileNode => {
    const existing = dirs.get(rel);
    if (existing) return existing;
    const parent = ensureDir(
      parentRel,
      parentRel.includes('/') ? parentRel.slice(0, parentRel.lastIndexOf('/')) : '',
      parentRel.includes('/') ? parentRel.slice(parentRel.lastIndexOf('/') + 1) : '',
    );
    const node: FileNode = {
      uri: DEMO_ROOT + rel,
      name,
      path: rel,
      type: 'directory',
      children: [],
    };
    parent.children!.push(node);
    dirs.set(rel, node);
    return node;
  };

  for (const rel of [...memory.keys()].sort()) {
    const parts = rel.split('/');
    const name = parts[parts.length - 1];
    const parentRel = parts.slice(0, -1).join('/');
    const parent =
      parentRel === ''
        ? root
        : ensureDir(
            parentRel,
            parentRel.includes('/') ? parentRel.slice(0, parentRel.lastIndexOf('/')) : '',
            parentRel.includes('/') ? parentRel.slice(parentRel.lastIndexOf('/') + 1) : parentRel,
          );
    parent.children!.push({ uri: DEMO_ROOT + rel, name, path: rel, type: 'file' });
  }

  const sortRec = (n: FileNode) => {
    if (!n.children) return;
    n.children.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1,
    );
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root.children ?? [];
}
