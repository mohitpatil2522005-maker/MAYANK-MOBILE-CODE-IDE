/**
 * Lightweight fuzzy matcher for the command palette / quick-open.
 *
 * Sublime/vscode-style subsequence matching with consecutive-match and
 * word-boundary bonuses. Pure and dependency-free (`match-sorter`-grade
 * behavior for our scale is unnecessary weight on mobile).
 */

const NO_MATCH = -1;

/**
 * Score `query` against `candidate` as a subsequence.
 * Returns NO_MATCH (-1) when the query isn't a subsequence.
 */
export function fuzzyScore(query: string, candidate: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const c = candidate.toLowerCase();

  let score = 0;
  let qi = 0; // query pointer
  let lastMatched = -2; // candidate index of previous hit
  let consecutive = 0;

  for (let ci = 0; ci < c.length && qi < q.length; ci++) {
    if (c[ci] !== q[qi]) continue;

    let bonus = 10;
    if (ci === 0) bonus += 8; // start of string
    const prev = ci > 0 ? c[ci - 1] : '';
    if (/[\/\-_.\s]/.test(prev)) bonus += 12; // word/segment boundary
    else if (prev >= 'a' && prev <= 'z' && candidate[ci] >= 'A' && candidate[ci] <= 'Z') {
      bonus += 12; // camelCase boundary
    }
    if (ci === lastMatched + 1) {
      consecutive += 1;
      bonus += 15 + Math.min(consecutive, 6) * 2; // streak reward
    } else {
      consecutive = 0;
    }
    score += bonus;
    lastMatched = ci;
    qi += 1;
  }

  if (qi < q.length) return NO_MATCH; // not all query chars matched
  // Prefer tighter spans: penalize distance between first and last hit,
  // and overall candidate length relative to match size.
  const span = lastMatched + 1;
  score -= Math.max(0, span - q.length);
  return score;
}

export interface Ranked<T> {
  item: T;
  score: number;
}

/**
 * Rank items by fuzzy score (desc), tie-broken by shorter text then alpha.
 * Non-matching items are dropped. Empty query returns the leading items.
 */
export function rankItems<T>(
  query: string,
  items: readonly T[],
  getText: (item: T) => string,
  limit = 50,
): Ranked<T>[] {
  const trimmed = query.trim();
  const scored: Ranked<T>[] = [];
  for (const item of items) {
    const text = getText(item);
    const score = fuzzyScore(trimmed, text);
    if (score === NO_MATCH) continue;
    scored.push({ item, score: trimmed ? score : -text.length });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = getText(a.item);
    const tb = getText(b.item);
    if (ta.length !== tb.length) return ta.length - tb.length;
    return ta.localeCompare(tb);
  });
  return scored.slice(0, limit);
}
