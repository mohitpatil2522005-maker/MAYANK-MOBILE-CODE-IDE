/**
 * Agent activity audit log (masterprompt §9.3b, minimum viable form).
 *
 * Records every agent tool decision — auto-executed, approved, rejected,
 * failed, or blocked by mode — with the tool, target, and mode. The log is
 * a capped ring buffer persisted to AsyncStorage (non-sensitive storage is
 * fine here: entries NEVER contain file contents, prompts, or secrets —
 * only tool names, project-relative paths, and timestamps).
 *
 * Viewed in Settings → "Agent activity"; exportable by copying.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AgentMode } from './agent';

export type AuditDecision =
  | 'auto-executed' // read-only tool ran without approval
  | 'pending' // write/edit preview created, awaiting user
  | 'approved'
  | 'rejected'
  | 'failed'
  | 'mode-blocked'; // write/edit attempted in Ask/Plan mode

export interface AuditEntry {
  ts: number;
  tool: string;
  decision: AuditDecision;
  /** Project-relative target (path or search pattern), never content. */
  target: string;
  mode: AgentMode;
  /** Short human note (e.g. error reason, capped). */
  note?: string;
}

export const AUDIT_MAX_ENTRIES = 200;
const AUDIT_KEY = 'mayank-ide/agentAudit/v1';

/** Cap any free-text note before it touches storage (no content blobs). */
export function capAuditNote(note: string | null | undefined, max = 160): string | undefined {
  if (!note) return undefined;
  const flat = note.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Extract a display target from tool args (path/pattern only). */
export function auditTarget(tool: string, args: Record<string, unknown>): string {
  const path = args.path;
  if (typeof path === 'string' && path) return path;
  const pattern = args.pattern;
  if (typeof pattern === 'string' && pattern) return `"${pattern}"`;
  return tool;
}

let memory: AuditEntry[] = [];
let loaded = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/** Subscribe to log changes; returns an unsubscribe function. */
export function useAgentAuditSubscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // a broken listener must never break the agent loop
    }
  }
}

/** Synchronous append + debounced persist. Safe to call from the loop. */
export function recordAudit(entry: Omit<AuditEntry, 'ts'>): void {
  memory = [...memory, { ...entry, ts: Date.now() }].slice(-AUDIT_MAX_ENTRIES);
  notify();
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void AsyncStorage.setItem(AUDIT_KEY, JSON.stringify(memory)).catch(() => undefined);
  }, 800);
}

/** Load the persisted ring (idempotent; keeps `memory` as source of truth). */
export async function loadAudit(): Promise<AuditEntry[]> {
  if (loaded) return memory;
  try {
    const raw = await AsyncStorage.getItem(AUDIT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AuditEntry[];
      if (Array.isArray(parsed)) memory = parsed.slice(-AUDIT_MAX_ENTRIES);
    }
  } catch {
    // corrupt payload → start fresh
  }
  loaded = true;
  return memory;
}

export function getAudit(): AuditEntry[] {
  return memory;
}

export async function clearAudit(): Promise<void> {
  memory = [];
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  notify();
  await AsyncStorage.removeItem(AUDIT_KEY).catch(() => undefined);
}

/** Format the log as plain text (for clipboard export). */
export function auditToText(entries: AuditEntry[]): string {
  const lines = entries.map((e) => {
    const when = new Date(e.ts).toISOString();
    const note = e.note ? ` — ${e.note}` : '';
    return `${when}  ${e.decision.padEnd(14)}  ${e.tool}(${e.target})  [${e.mode}]${note}`;
  });
  return `Mayank IDE — agent activity log (${entries.length} entries)\n${lines.join('\n')}`;
}
