/**
 * Permission store (Slice 3) — user-managed rules + audit log, persisted.
 *
 * Rules feed evaluatePermission(); every decision (auto-allowed included)
 * appends an audit entry. The audit log contains no file contents and no
 * secrets (§9.3b).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  evaluatePermission,
  makeAuditId,
  type AuditEntry,
  type PermissionRule,
  type PermAction,
  type PermDecision,
  type PermRequest,
  type PermResult,
} from '@/src/lib/permissions/engine';

const RULES_KEY = 'mayank-ide/permissionRules/v1';
const AUDIT_KEY = 'mayank-ide/permissionAudit/v1';
const AUDIT_RING = 200;

interface PermissionState {
  rules: PermissionRule[];
  audit: AuditEntry[];
  loaded: boolean;

  load: () => Promise<void>;
  addRule: (rule: Omit<PermissionRule, 'id'>) => void;
  removeRule: (index: number) => void;
  /** Decide a request; records the outcome in the audit log. */
  decide: (req: PermRequest, sessionId?: string, userResponse?: PermDecision) => PermResult;
  clearAudit: () => void;
}

function persist<T>(key: string, value: T): void {
  void AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
}

export const usePermissionStore = create<PermissionState>()((set, get) => ({
  rules: [],
  audit: [],
  loaded: false,

  async load() {
    if (get().loaded) return;
    set({ loaded: true });
    const [r, a] = await Promise.all([
      AsyncStorage.getItem(RULES_KEY).catch(() => null),
      AsyncStorage.getItem(AUDIT_KEY).catch(() => null),
    ]);
    set({
      rules: r ? (JSON.parse(r) as PermissionRule[]) : [],
      audit: a ? (JSON.parse(a) as AuditEntry[]).slice(-AUDIT_RING) : [],
    });
  },

  addRule(rule) {
    set((s) => {
      const rules = [...s.rules, { ...rule }];
      persist(RULES_KEY, rules);
      return { rules };
    });
  },

  removeRule(index) {
    set((s) => {
      const rules = s.rules.filter((_, i) => i !== index);
      persist(RULES_KEY, rules);
      return { rules };
    });
  },

  decide(req, sessionId, userResponse) {
    const result = evaluatePermission(get().rules, req);
    const entry: AuditEntry = {
      id: makeAuditId(),
      ts: Date.now(),
      sessionId,
      action: req.action,
      target: req.target,
      decision: result.decision,
      ruleMatched: result.matched ? result.matched.target : 'default',
      userResponse,
    };
    set((s) => {
      const audit = [...s.audit, entry].slice(-AUDIT_RING);
      persist(AUDIT_KEY, audit);
      return { audit };
    });
    return result;
  },

  clearAudit() {
    set({ audit: [] });
    void AsyncStorage.removeItem(AUDIT_KEY).catch(() => undefined);
  },
}));

void usePermissionStore.getState().load();

// Convenience re-exports for UI + agent wiring.
export { evaluatePermission } from '@/src/lib/permissions/engine';
export type { PermAction, PermRequest, PermissionRule, PermResult, AuditEntry } from '@/src/lib/permissions/engine';

/** Default rules shipped with the app (§9.3b secure-by-default). */
export const DEFAULT_PERMISSION_RULES: Array<Omit<PermissionRule, 'id'>> = [
  { action: 'read_file', target: '*', decision: 'allow', scope: 'project', note: 'Reads inside the project are allowed' },
  { action: 'write_file', target: '*', decision: 'ask', scope: 'project', note: 'Writes always need approval' },
  { action: 'delete_file', target: '*', decision: 'ask', scope: 'project', note: 'Deletes always need approval' },
  { action: 'command', target: '*', decision: 'ask', scope: 'project', note: 'Shell commands always need approval' },
  { action: 'read_url', target: '*', decision: 'ask', scope: 'project', note: 'URL fetches need approval' },
];
