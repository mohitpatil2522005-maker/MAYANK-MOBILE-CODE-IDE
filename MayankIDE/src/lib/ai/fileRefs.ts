/**
 * Extracts project file references from assistant text (Phase 5 bridge):
 * messages can then offer "open in editor" chips for paths the model named.
 * Matching is conservative — exact path first, then unambiguous filename.
 */
import type { FileNode } from '@/src/lib/fs/types';

const PATHISH_RE = /[\w./-]+\.[A-Za-z0-9]{1,8}\b/g;

export function extractProjectFileRefs(text: string, files: FileNode[], max = 6): FileNode[] {
  const byPath = new Map<string, FileNode>();
  const byName = new Map<string, FileNode[]>();
  for (const file of files) {
    if (file.truncated) continue;
    byPath.set(file.path, file);
    const list = byName.get(file.name);
    if (list) list.push(file);
    else byName.set(file.name, [file]);
  }

  const found = new Map<string, FileNode>();
  for (const match of text.matchAll(PATHISH_RE)) {
    const candidate = match[0]
      .replace(/^[./]+/, '')
      .replace(/[.,;:'"`)\]]+$/g, '');
    if (!candidate || candidate.includes('://')) continue;

    let node = byPath.get(candidate) ?? null;
    if (!node) {
      // Suffix match: model wrote "a.ts" for "src/a.ts", or "lib/ai/tools.ts"
      // while the tree holds "src/lib/ai/tools.ts".
      const name = candidate.split('/').pop() ?? candidate;
      const sameName = byName.get(name) ?? [];
      const suffixMatches = sameName.filter((f) => f.path.endsWith(candidate));
      if (suffixMatches.length === 1) node = suffixMatches[0];
      else if (sameName.length === 1 && !candidate.includes('/')) node = sameName[0];
    }
    if (node) found.set(node.uri, node);
    if (found.size >= max) break;
  }
  return [...found.values()];
}
