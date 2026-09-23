/**
 * Pure-logic find & replace engine — shared by the in-editor Find/Replace bar
 * (works identically on the WebView build via postMessage and on the web build
 * via direct CodeMirror commands).
 *
 * Counted metrics only; the editor surface is the source of truth for
 * selection state, so we never try to mutate the document here.
 */

export interface FindMatch {
  /** 0-based character offset of the match start in the document. */
  from: number;
  /** Exclusive end offset. */
  to: number;
}

export interface FindOptions {
  /** Treat the query as a regular expression. */
  regex: boolean;
  /** Case-insensitive match. */
  caseSensitive: boolean;
  /** Require the preceding character to be a word boundary. */
  wholeWord: boolean;
}

/** Clamp any user input down to a sane cap so a runaway query can't lock the UI. */
export const MAX_FIND_QUERY = 200;
export const MAX_FIND_RESULTS = 5000;

export interface FindResult {
  matches: FindMatch[];
  /** Throws or returns null when the query is an invalid regex. */
  error: string | null;
  /** Effective pattern that was used (after escaping for literal mode). */
  effectivePattern: string;
}

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordBoundaryBefore(text: string, index: number): boolean {
  if (index === 0) return true;
  const prev = text[index - 1];
  return !/[A-Za-z0-9_]/.test(prev);
}

function wordBoundaryAfter(text: string, index: number): boolean {
  if (index >= text.length) return true;
  const next = text[index];
  return !/[A-Za-z0-9_]/.test(next);
}

/**
 * Find all occurrences of `query` in `text` under the given options.
 * Returns at most `MAX_FIND_RESULTS` matches; if the cap is hit, the last
 * entry has its `to` value set to -1 as a sentinel so the UI can show
 * "refine your query".
 */
export function findAll(text: string, query: string, opts: FindOptions): FindResult {
  const q = query.slice(0, MAX_FIND_QUERY);
  if (!q) return { matches: [], error: null, effectivePattern: '' };

  let pattern = opts.regex ? q : escapeRegex(q);
  if (opts.wholeWord) pattern = `\\b${pattern}\\b`;

  let re: RegExp;
  try {
    re = new RegExp(pattern, opts.caseSensitive ? 'g' : 'gi');
  } catch (err) {
    return {
      matches: [],
      error: err instanceof Error ? err.message : 'Invalid pattern',
      effectivePattern: pattern,
    };
  }

  const out: FindMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index === re.lastIndex) {
      // Zero-width match: advance by one to avoid an infinite loop.
      re.lastIndex += 1;
      if (re.lastIndex > text.length) break;
      continue;
    }
    if (opts.wholeWord) {
      if (!wordBoundaryBefore(text, m.index)) continue;
      if (!wordBoundaryAfter(text, m.index + m[0].length)) continue;
    }
    out.push({ from: m.index, to: m.index + m[0].length });
    if (out.length >= MAX_FIND_RESULTS) {
      out.push({ from: -1, to: -1 });
      break;
    }
  }
  return { matches: out, error: null, effectivePattern: pattern };
}

/**
 * Produce the list of new text ranges after applying a replace. The original
 * `text` is not mutated. This is the function the dry-run confirmation sheet
 * uses (per §4.2 — replace-all guarded by a diff-summary).
 */
export interface ReplacePlan {
  result: string;
  replacedCount: number;
  /**
   * Ranges of changed text in the *original* document, paired with the
   * (already expanded) replacement text written there — so summarisePlan
   * can count added characters without slicing `result` at original-text
   * offsets (which drift once replacement lengths differ).
   */
  changedRanges: Array<{ from: number; to: number; replacement: string }>;
}

export function planReplace(
  text: string,
  query: string,
  replacement: string,
  opts: FindOptions,
): ReplacePlan {
  const { matches } = findAll(text, query, opts);
  const realMatches = matches.filter((m) => m.from !== -1);
  if (realMatches.length === 0) {
    return { result: text, replacedCount: 0, changedRanges: [] };
  }
  // Re-run the same regex to capture group values for back-reference
  // expansion ($1, $&, $`, $'). We scan once, in order, so lastIndex stays
  // in sync with the offsets findAll already produced.
  const isRegex = opts.regex;
  const re = isRegex
    ? new RegExp(
        opts.wholeWord ? `\\b${query}\\b` : query,
        opts.caseSensitive ? 'g' : 'gi',
      )
    : null;

  // Collect per-match captured groups in document order (only when regex).
  const groupValues: Array<Array<string | undefined>> = [];
  if (isRegex && re) {
    const scanRe = new RegExp(re);
    let gm: RegExpExecArray | null;
    let guard = 0;
    while ((gm = scanRe.exec(text)) !== null && guard < realMatches.length + 1) {
      groupValues.push(gm.slice(0));
      if (scanRe.lastIndex === gm.index) scanRe.lastIndex += 1;
      guard += 1;
    }
  }

  const pieces: string[] = [];
  const changed: Array<{ from: number; to: number; replacement: string }> = [];
  let cursor = 0;
  let gi = 0;
  for (const m of realMatches) {
    pieces.push(text.slice(cursor, m.from));
    let value = replacement;
    if (isRegex) {
      const exec = groupValues[gi];
      if (exec) {
        value = replacement.replace(/\$([$&`']|\d{1,2})/g, (_, g) => {
          if (g === '$') return '$';
          if (g === '&') return exec[0] ?? '';
          if (g === '`') return text.slice(0, m.from);
          if (g === "'") return text.slice(m.to);
          const n = Number(g);
          if (Number.isFinite(n) && n >= 0 && n < exec.length) return exec[n] ?? '';
          return g;
        });
      }
    }
    gi += 1;
    pieces.push(value);
    changed.push({ from: m.from, to: m.to, replacement: value });
    cursor = m.to;
  }
  pieces.push(text.slice(cursor));
  return {
    result: pieces.join(''),
    replacedCount: realMatches.length,
    changedRanges: changed,
  };
}

/** Build a Bridge-friendly summary of a plan for the confirmation sheet. */
export function summarisePlan(text: string, plan: ReplacePlan): {
  fileCount: 1;
  changedLines: number;
  added: number;
  removed: number;
} {
  let added = 0;
  let removed = 0;
  const changedLines = new Set<number>();
  for (const r of plan.changedRanges) {
    // Removed: length of the original span (ranges are original-doc offsets).
    removed += r.to - r.from;
    // Added: the replacement text actually written there. Slicing plan.result
    // at these offsets would read shifted content once lengths differ (Fix #6).
    added += r.replacement.length;
    const startLine = lineNumberAt(text, r.from);
    const endLine = lineNumberAt(text, Math.max(r.to - 1, r.from));
    for (let l = startLine; l <= endLine; l += 1) changedLines.add(l);
  }
  return {
    fileCount: 1,
    changedLines: changedLines.size,
    added,
    removed,
  };
}

function lineNumberAt(text: string, offset: number): number {
  let line = 1;
  const limit = Math.min(offset, text.length);
  for (let i = 0; i < limit; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/**
 * Advance from the current match index to the next one, wrapping around.
 * The editor surface calls this to drive the "Next" / "Prev" buttons.
 */
export function nextMatchIndex(current: number, total: number, direction: 1 | -1): number {
  if (total <= 0) return -1;
  if (current < 0) return direction === 1 ? 0 : total - 1;
  return (current + direction + total) % total;
}
