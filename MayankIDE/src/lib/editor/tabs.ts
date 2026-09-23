/**
 * Pure tab-strip helpers for the editor (Phase 1.1).
 *
 * Kept free of store/React imports so the adjacent-tab selection used by
 * `projectStore.closeFile` is unit-testable under plain tsx (Fix #8).
 */

/**
 * Pick the tab to activate after closing `closingUri`.
 *
 * Preference order (VS Code behaviour): the left neighbour if one exists,
 * otherwise the first tab to the right; `null` when no tabs remain or the
 * uri is not in the list.
 *
 * @param uris Tab order before closing.
 * @param closingUri Uri of the tab being closed.
 */
export function adjacentActiveUri(uris: readonly string[], closingUri: string): string | null {
  const index = uris.indexOf(closingUri);
  if (index === -1) return null;
  const rest = uris.filter((u) => u !== closingUri);
  if (rest.length === 0) return null;
  if (index > 0) return rest[index - 1];
  return rest[0];
}