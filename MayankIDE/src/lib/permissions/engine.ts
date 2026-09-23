/**
 * Permission engine (Slice 3, §9.3b of the masterprompt).
 *
 * Pure logic: given an ordered list of rules and a (action, target) request,
 * decide allow / ask / deny. Precedence is deny → ask → allow (the first
 * matching rule in that order wins). Implicit rules are enforced:
 *   - allow write_file implies allow read_file on the same target
 *   - deny read_file implies deny write_file on the same target
 *   - denying a directory denies its descendants
 *
 * Targets are normalized before matching (POSIX, NFC). Wildcards:
 *   - `*`         → any single target
 *   - `dir/**`   → the directory subtree
 *   - `prefix*`  → any target starting with `prefix`
 *   - `regex:…`  → ES regex against the normalized target
 */

export type PermAction =
  | 'read_file'
  | 'write_file'
  | 'delete_file'
  | 'read_url'
  | 'execute_url'
  | 'command'
  | 'mcp'
  | 'extension'
  | 'clipboard'
  | 'share_external'
  | 'biometric'
  | 'network_domain'
  | 'agent_tool';

export type PermDecision = 'allow' | 'ask' | 'deny';

export interface PermissionRule {
  id?: string;
  action: PermAction;
  target: string;
  decision: PermDecision;
  scope?: 'session' | 'project' | 'global';
  note?: string;
}

export interface PermRequest {
  action: PermAction;
  /** Raw target; will be normalized before matching. */
  target: string;
}

export interface PermResult {
  decision: PermDecision;
  /** The rule that matched, or null when the default (ask) applied. */
  matched: PermissionRule | null;
  /** Why the decision was reached (for the audit log / prompt card). */
  reason: string;
}

/** Normalize a target to a comparable POSIX-ish form. */
export function normalizeTarget(raw: string): string {
  let t = String(raw ?? '');
  // Regex rules are patterns, not paths — return them verbatim so the regex
  // check in targetMatches() sees the original pattern.
  if (t.startsWith('regex:')) return t;
  // Backslash → forward slash (Windows inputs, §9.3b "backslash inputs").
  t = t.replace(/\\/g, '/');
  // NFC unicode normalization (critical on iOS, §9.3b).
  if (typeof t.normalize === 'function') t = t.normalize('NFC');
  // Collapse duplicate slashes.
  t = t.replace(/\/{2,}/g, '/');
  return t;
}

function targetMatches(ruleTarget: string, normalized: string): boolean {
  // Regex rule.
  if (ruleTarget.startsWith('regex:')) {
    try {
      return new RegExp(ruleTarget.slice(6)).test(normalized);
    } catch {
      return false;
    }
  }
  // Whole-target wildcard.
  if (ruleTarget === '*') return true;
  // Subtree: `dir/**` matches `dir` and everything under it.
  if (ruleTarget.endsWith('/**')) {
    const base = ruleTarget.slice(0, -3);
    return normalized === base || normalized.startsWith(base + '/');
  }
  // Prefix wildcard: `src/*` → startsWith `src/` OR equals `src` (single).
  if (ruleTarget.endsWith('*') && !ruleTarget.endsWith('/**')) {
    const prefix = ruleTarget.slice(0, -1);
    return normalized.startsWith(prefix);
  }
  // Exact match.
  return normalized === ruleTarget;
}

function descendant(normalized: string, ruleTarget: string): boolean {
  // A deny on a directory denies its descendants (§9.3b).
  if (ruleTarget === '*') return true;
  if (ruleTarget.endsWith('/**')) {
    const base = ruleTarget.slice(0, -3);
    return normalized === base || normalized.startsWith(base + '/');
  }
  // Plain directory target: treat as a subtree boundary.
  return normalized === ruleTarget || normalized.startsWith(ruleTarget + '/');
}

/**
 * Decide a request against the rule list. `rules` are evaluated in order;
 * the decision precedence (deny → ask → allow) is implemented by scanning
 * for the highest-priority matching rule.
 */
export function evaluatePermission(rules: PermissionRule[], req: PermRequest): PermResult {
  const normalized = normalizeTarget(req.target);

  // Collect the best match per decision, preserving rule order.
  let deny: PermissionRule | null = null;
  let ask: PermissionRule | null = null;
  let allow: PermissionRule | null = null;

  for (const rule of rules) {
    const ruleNorm = normalizeTarget(rule.target);
    const sameTarget = targetMatches(ruleNorm, normalized);
    const containsTarget =
      (req.action === 'read_file' ||
        req.action === 'write_file' ||
        req.action === 'delete_file') &&
      descendant(normalized, ruleNorm);

    // Does this rule apply to the requested action + target?
    // - Same action + matching target (exact / wildcard / subtree / regex).
    // - Implicit: an allow on write_file grants read_file on the same target.
    // - Implicit: a deny on read_file denies write_file on the same target.
    // Note: allow read_file does NOT grant write_file (the request would
    // still fall through to the secure default).
    let applies = false;
    if (rule.action === req.action && (sameTarget || containsTarget)) {
      applies = true;
    } else if (rule.action === 'write_file' && req.action === 'read_file' && sameTarget) {
      applies = true;
    } else if (rule.action === 'read_file' && req.action === 'write_file' && rule.decision === 'deny' && sameTarget) {
      applies = true;
    }

    if (!applies) continue;

    if (rule.decision === 'deny' && !deny) deny = rule;
    else if (rule.decision === 'ask' && !ask) ask = rule;
    else if (rule.decision === 'allow' && !allow) allow = rule;
  }

  // Precedence: deny → ask → allow → default ask.
  if (deny) {
    return { decision: 'deny', matched: deny, reason: `Denied by rule "${deny.target}"` };
  }
  if (ask) {
    return { decision: 'ask', matched: ask, reason: `Ask by rule "${ask.target}"` };
  }
  if (allow) {
    return { decision: 'allow', matched: allow, reason: `Allowed by rule "${allow.target}"` };
  }
  // Default: secure by default (§9.3b — anything unconfigured = ask).
  return { decision: 'ask', matched: null, reason: 'No rule matched — default is ask (secure by default)' };
}

/** Audit-log entry: one per decision (including auto-allowed). */
export interface AuditEntry {
  id: string;
  ts: number;
  sessionId?: string;
  action: PermAction;
  target: string;
  decision: PermDecision;
  /** The rule that matched, or 'default'. */
  ruleMatched: string;
  /** What the user chose when prompted (for ask decisions). */
  userResponse?: PermDecision;
  durationMs?: number;
}

let auditCounter = 0;
export function makeAuditId(): string {
  auditCounter += 1;
  return `aud-${Date.now().toString(36)}-${auditCounter}`;
}
