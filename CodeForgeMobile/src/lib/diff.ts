/**
 * Minimal line-based diff (LCS dynamic programming) for agent edit previews.
 * Falls back to a coarse "replace everything" preview for very large pairs.
 */

export interface DiffLine {
  type: 'same' | 'add' | 'remove';
  text: string;
}

export interface ComputedDiff {
  lines: DiffLine[];
  added: number;
  removed: number;
  /** True when the inputs were too large and the diff is coarse-grained. */
  coarse: boolean;
}

const MAX_CELLS = 2_000_000;

export function computeLineDiff(oldText: string, newText: string): ComputedDiff {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const n = a.length;
  const m = b.length;

  if (n * m > MAX_CELLS) {
    // Too large for a precise diff — show it as full remove + full add.
    return {
      lines: [
        ...a.map((text) => ({ type: 'remove' as const, text })),
        ...b.map((text) => ({ type: 'add' as const, text })),
      ],
      added: m,
      removed: n,
      coarse: true,
    };
  }

  // LCS table: cell[i][j] = LCS length of a[0..i) and b[0..j). Uint32 keeps memory low.
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = 1; i <= n; i++) {
    const row = i * width;
    const prevRow = (i - 1) * width;
    for (let j = 1; j <= m; j++) {
      table[row + j] =
        a[i - 1] === b[j - 1]
          ? table[prevRow + j - 1] + 1
          : Math.max(table[prevRow + j], table[row + j - 1]);
    }
  }

  // Backtrack from (n, m) to build the line diff.
  const reversed: DiffLine[] = [];
  let i = n;
  let j = m;
  let added = 0;
  let removed = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      reversed.push({ type: 'same', text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || table[i * width + j - 1] >= table[(i - 1) * width + j])) {
      reversed.push({ type: 'add', text: b[j - 1] });
      j--;
      added++;
    } else {
      reversed.push({ type: 'remove', text: a[i - 1] });
      i--;
      removed++;
    }
  }
  reversed.reverse();
  return { lines: reversed, added, removed, coarse: false };
}

/** Collapse long runs of unchanged lines for compact previews. */
export function collapseContext(lines: DiffLine[], context = 2, maxLines = 60): DiffLine[] {
  const out: DiffLine[] = [];
  let runStart = -1;
  const flush = (endExclusive: number) => {
    if (runStart < 0) return;
    const run = lines.slice(runStart, endExclusive);
    if (run.length <= context * 2 + 1) {
      out.push(...run);
    } else {
      out.push(...run.slice(0, context));
      out.push({ type: 'same', text: `… ${run.length - context * 2} unchanged lines …` });
      out.push(...run.slice(run.length - context));
    }
    runStart = -1;
  };

  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    if (line.type === 'same') {
      if (runStart < 0) runStart = k;
    } else {
      flush(k);
      out.push(line);
    }
    if (out.length > maxLines) {
      // Caller still gets correct counts from the uncollapsed diff.
      break;
    }
  }
  flush(lines.length);
  return out;
}
