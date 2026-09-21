/**
 * Platform-neutral project filesystem abstraction.
 * Implementations live in projectFs.ts (native) and projectFs.web.ts (web);
 * Metro resolves the right file per platform.
 */

export interface FileNode {
  /** Unique, FS-specific identifier (SAF uri, file path, webfs:// or demo:// uri). */
  uri: string;
  /** Display name, e.g. "App.tsx". */
  name: string;
  /** Path relative to the project root, e.g. "src/App.tsx". */
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  /** True when the subtree was skipped because scan limits were hit. */
  truncated?: boolean;
}

export interface PickedProject {
  name: string;
  rootUri: string;
  tree: FileNode[];
}

export interface ProjectFS {
  /** Ask the user to open a folder. Returns null when cancelled / unsupported. */
  pickProject(): Promise<PickedProject | null>;
  /** Restore a previously opened project from its persisted rootUri. Null when unavailable. */
  restoreProject(rootUri: string): Promise<PickedProject | null>;
  readFile(uri: string): Promise<string>;
  writeFile(uri: string, content: string): Promise<void>;
  /**
   * Create a new file (parent directories included) and write content.
   * `relativePath` is project-relative ("src/new/util.ts"). Returns the
   * created node so the tree can update. Optional: implementations without
   * create support (none currently) may omit it — the agent surfaces an error.
   */
  createFile?(relativePath: string, content: string): Promise<FileNode>;
}
