/**
 * Resolve CodeMirror tag EXPRESSIONS ("keyword", "function(variableName)")
 * into Lezer Tag objects. The expressions travel over the RN ↔ WebView
 * JSON bridge, so the concrete Tag nodes are materialized on each side by
 * the same logic (a JS twin lives inline in codemirrorHtml.ts — keep in
 * sync).
 */

type TagsTable = Record<string, unknown>;

/** Tiny recursive-descent parser: name | name(expr). Max depth 3. */
export function resolveTagExpr(expr: string, tags: TagsTable): unknown | null {
  const s = expr.trim();
  if (!s) return null;

  const paren = s.indexOf('(');
  if (paren === -1) {
    return Object.prototype.hasOwnProperty.call(tags, s) ? tags[s] : null;
  }
  if (!s.endsWith(')')) return null;
  const name = s.slice(0, paren).trim();
  const inner = s.slice(paren + 1, -1);
  const innerTag = resolveTagExpr(inner, tags);
  const base = Object.prototype.hasOwnProperty.call(tags, name)
    ? (tags[name] as Record<string, unknown>)
    : null;
  if (!base || !innerTag) return null;
  // Lezer Tag API: tag(child) narrows the parent tag.
  const call = base as unknown as (child: unknown) => unknown;
  try {
    return call.call(base, innerTag);
  } catch {
    return null;
  }
}
