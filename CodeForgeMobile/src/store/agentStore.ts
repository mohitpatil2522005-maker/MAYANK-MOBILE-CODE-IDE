/**
 * Agent session state + orchestration loop (agent.md §4, master_prompt Phase 3).
 *
 * Flow: user message → stream assistant reply → parse tool calls →
 * read-only tools auto-execute / write tools wait for approval →
 * tool feedback goes back to the model → loop (max MAX_ITERATIONS).
 * Never auto-applies writes: pending approvals gate the loop.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  buildSystemPrompt,
  buildToolFeedbackMessage,
  capContent,
  countFiles,
  packHistory,
  shallowTreePreview,
  SELECTION_CHAR_CAP,
  type ToolFeedback,
} from '@/src/lib/ai/agent';
import { PROVIDER_PRESETS } from '@/src/lib/ai/presets';
import { getDefaultProvider, useProviderRegistry } from '@/src/lib/ai/registry';
import { createProviderClient } from '@/src/lib/ai/providers';
import {
  extractToolCalls,
  READ_ONLY_TOOLS,
  type ParsedToolCall,
  type ToolName,
} from '@/src/lib/ai/tools';
import {
  applyWriteCall,
  executeReadOnlyTool,
  previewWriteCall,
  type WritePreview,
} from '@/src/lib/ai/toolExecutor';
import type { AIProviderConfig, ChatMessage } from '@/src/lib/ai/types';
import { languageFromFilename } from '@/src/lib/editor/languages';
import { getApiKey } from '@/src/lib/storage/keychain';
import { useProjectStore } from '@/src/store/projectStore';

const MAX_ITERATIONS = 6;
const MODEL_PREF_KEY = 'codeforge/agentModel/v1';
const SESSION_KEY = 'codeforge/agentSession/v1';
const SESSION_MAX_MESSAGES = 80;

export type ToolCallStatus =
  | 'running'
  | 'executed'
  | 'failed'
  | 'pending-approval'
  | 'rejected'
  | 'applied';

export interface ToolCallState {
  callId: string;
  tool: ToolName;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  summary?: string;
  error?: string;
  /** Short result body shown on the card (capped). */
  resultPreview?: string;
  /** Full result body fed back to the model on resume (not displayed). */
  feedbackFull?: string;
  /** Write/edit preview payload. */
  preview?: WritePreview;
  call: ParsedToolCall;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'note';
  content: string;
  toolCalls?: ToolCallState[];
  status: 'complete' | 'streaming' | 'error' | 'cancelled';
  /** Tool-feedback turns stay in history but are hidden from the chat UI. */
  hidden?: boolean;
  createdAt: number;
}

export type AgentPhase = 'idle' | 'streaming' | 'awaiting-approval';

interface AgentSessionState {
  messages: AgentMessage[];
  phase: AgentPhase;
  /** Agentic iterations consumed in the current user turn (safety cap). */
  turnCount: number;
  /** Provider+model used for the next request. */
  activeProviderId: string | null;
  activeModel: string | null;
  modelPrefLoaded: boolean;
  sessionLoaded: boolean;
  /** Prompt text staged by "Send to Agent" in the editor; Composer consumes it. */
  draft: string | null;
  /** Set when the agent applies an edit; the editor reveals the changed line. */
  lastAppliedEdit: { path: string; firstNewLine: number } | null;

  loadModelPref: () => Promise<void>;
  /** Restore the previous chat session from AsyncStorage (multi-turn PRD §3.2). */
  hydrateSession: () => Promise<void>;
  selectModel: (providerId: string, model: string) => void;
  newChat: () => void;
  sendMessage: (text: string) => Promise<void>;
  cancelRun: () => void;
  approveToolCall: (messageId: string, callId: string) => Promise<void>;
  rejectToolCall: (messageId: string, callId: string) => void;
  /** Re-send after an API error: drops the failed assistant turn, re-streams. */
  retryLast: () => Promise<void>;
  setDraft: (text: string | null) => void;
  clearAppliedEdit: () => void;
}

let runCounter = 0;
let cancelledRunId = -1;
let messageCounter = 0;
/** Per-launch nonce so restored session ids never collide with new ones. */
const sessionNonce = Math.random().toString(36).slice(2, 8);
let sessionHydrated = false;

function nextMessageId(role: string): string {
  messageCounter += 1;
  return `${role}-${sessionNonce}-${Date.now().toString(36)}-${messageCounter}`;
}

/** Strip heavy/transient fields before writing the session to storage. */
function serializeSession(messages: AgentMessage[]): AgentMessage[] {
  return messages.slice(-SESSION_MAX_MESSAGES).map((m) => ({
    ...m,
    status: m.status === 'streaming' ? 'cancelled' : m.status,
    toolCalls: m.toolCalls?.map((c) => {
      const { feedbackFull, ...rest } = c;
      return rest;
    }),
  }));
}

/** On restore, in-flight states degrade gracefully (nothing half-applied). */
function sanitizeRestored(messages: AgentMessage[]): AgentMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages.map((m) => ({
    ...m,
    status: m.status === 'streaming' ? 'cancelled' : m.status,
    toolCalls: m.toolCalls?.map((c) =>
      c.status === 'running' || c.status === 'pending-approval'
        ? { ...c, status: 'failed' as const, error: 'Session restored — ask Forge to propose this change again.' }
        : c,
    ),
  }));
}

function targetProvider(state: AgentSessionState): {
  provider: AIProviderConfig | undefined;
  model: string | undefined;
} {
  const registry = useProviderRegistry.getState();
  const provider =
    (state.activeProviderId ? registry.getProvider(state.activeProviderId) : undefined) ??
    getDefaultProvider();
  if (!provider) return { provider: undefined, model: undefined };
  const model =
    state.activeProviderId === provider.id && state.activeModel
      ? state.activeModel
      : (provider.defaultModel ?? provider.models[0]?.id);
  return { provider, model };
}

export const useAgentStore = create<AgentSessionState>()((set, get) => {
  const patchMessage = (id: string, patch: Partial<AgentMessage>) => {
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  };

  const patchToolCall = (
    messageId: string,
    callId: string,
    patch: Partial<ToolCallState>,
  ): ToolCallState | undefined => {
    let updated: ToolCallState | undefined;
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              toolCalls: m.toolCalls?.map((c) => {
                if (c.callId !== callId) return c;
                updated = { ...c, ...patch };
                return updated;
              }),
            }
          : m,
      ),
    }));
    return updated;
  };

  /** Build the [system, ...history] request from the current session. */
  function buildRequestMessages(): { system: string; history: ChatMessage[] } {
    const project = useProjectStore.getState();
    const active = project.openFiles.find((f) => f.uri === project.activeUri) ?? null;
    const system = buildSystemPrompt({
      projectName: project.projectName ?? 'untitled project',
      fileCount: countFiles(project.tree),
      currentFile: active
        ? {
            path: active.path,
            language: languageFromFilename(active.name),
            content: capContent(active.content),
          }
        : null,
      selection: project.selection
        ? capContent(project.selection, SELECTION_CHAR_CAP)
        : null,
      treePreview: shallowTreePreview(project.tree),
    });
    const history: ChatMessage[] = get().messages
      .filter((m) => m.status === 'complete' || m.role === 'user')
      .map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      }));
    return { system, history: packHistory(history) };
  }

  /** Resolve all pending approvals on a message; resumes the loop when done. */
  async function maybeResume(messageId: string): Promise<void> {
    const msg = get().messages.find((m) => m.id === messageId);
    if (!msg?.toolCalls) return;
    const pending = msg.toolCalls.filter((c) => c.status === 'pending-approval');
    if (pending.length > 0) return; // still waiting on the user
    if (get().phase !== 'awaiting-approval') return;

    // Gather feedback from every call in this turn (full bodies where stored).
    const feedback: ToolFeedback[] = msg.toolCalls.map((c) => {
      if (c.status === 'rejected') {
        return { tool: c.tool, status: 'rejected', note: 'User rejected this change. Do not re-apply it; ask or propose an alternative.' };
      }
      if (c.status === 'failed') {
        return { tool: c.tool, status: 'error', error: c.feedbackFull ?? c.error ?? 'unknown error' };
      }
      return { tool: c.tool, status: 'ok', result: c.feedbackFull ?? c.resultPreview ?? c.summary ?? 'done' };
    });

    set({ phase: 'streaming' });
    const feedbackMessage: AgentMessage = {
      id: nextMessageId('user'),
      role: 'user',
      content: buildToolFeedbackMessage(feedback),
      status: 'complete',
      hidden: true,
      createdAt: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, feedbackMessage] }));
    await streamTurn();
  }

  /** One assistant turn: stream text, then handle tool calls. */
  async function streamTurn(): Promise<void> {
    const state = get();
    if (state.turnCount >= MAX_ITERATIONS) {
      appendNote(`Stopped after ${MAX_ITERATIONS} tool turns (safety limit). Ask Forge to continue if needed.`);
      set({ phase: 'idle' });
      return;
    }
    const { provider, model } = targetProvider(state);
    if (!provider || !model) {
      appendNote('No AI provider configured yet. Add one in Settings → Providers to start chatting.');
      set({ phase: 'idle' });
      return;
    }

    const runId = ++runCounter;
    const assistantId = nextMessageId('assistant');
    const assistantMessage: AgentMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, assistantMessage], phase: 'streaming' }));

    const apiKey = await getApiKey(provider.id);
    if (PROVIDER_PRESETS[provider.type].requiresKey && !apiKey) {
      patchMessage(assistantId, {
        status: 'error',
        content: `No API key stored for **${provider.name}**.\n\nAdd it in **Settings → Providers → Edit**, then tap Retry. The key goes into the OS keychain and is only sent to ${provider.baseURL}.`,
      });
      set({ phase: 'idle' });
      return;
    }
    const { system, history } = buildRequestMessages();
    const client = createProviderClient(provider);

    let fullText = '';
    let streamError: string | null = null;
    try {
      const stream = client.chat(
        { model, messages: [{ role: 'system', content: system }, ...history] },
        apiKey,
      );
      for await (const token of stream) {
        if (cancelledRunId === runId) break;
        if (token.type === 'text' && token.text) {
          fullText += token.text;
          patchMessage(assistantId, { content: fullText });
        } else if (token.type === 'error') {
          streamError = token.error ?? 'Stream error';
          break;
        }
      }
    } catch (err) {
      streamError = err instanceof Error ? err.message : String(err);
    }

    if (cancelledRunId === runId) {
      patchMessage(assistantId, { status: 'cancelled', content: fullText });
      set({ phase: 'idle' });
      return;
    }
    if (streamError) {
      patchMessage(assistantId, {
        status: 'error',
        content: fullText ? `${fullText}\n\n⚠️ ${streamError}` : `⚠️ ${streamError}`,
      });
      set({ phase: 'idle' });
      return;
    }

    // Turn text complete — look for tool calls.
    const { calls, cleanText } = extractToolCalls(fullText);
    if (calls.length === 0) {
      patchMessage(assistantId, { status: 'complete', content: cleanText || fullText });
      set({ phase: 'idle' });
      return;
    }

    const toolStates: ToolCallState[] = calls.map((call, i) => ({
      callId: `${assistantId}-tool-${i}`,
      tool: call.tool,
      args: call.args,
      status: READ_ONLY_TOOLS.has(call.tool) ? 'running' : 'pending-approval',
      call,
    }));
    patchMessage(assistantId, { content: cleanText, toolCalls: toolStates, status: 'complete' });

    // Execute: read-only instantly, write/edit → previews for approval.
    const autoFeedback: ToolFeedback[] = [];
    let hasPendingWrites = false;

    for (const state of toolStates) {
      if (READ_ONLY_TOOLS.has(state.tool)) {
        const result = await executeReadOnlyTool(state.call);
        if (cancelledRunId === runId) return;
        patchToolCall(assistantId, state.callId, {
          status: result.ok ? 'executed' : 'failed',
          summary: result.summary,
          error: result.error,
          resultPreview: result.feedback.slice(0, 1_500),
          feedbackFull: result.feedback,
        });
        autoFeedback.push({
          tool: state.tool,
          status: result.ok ? 'ok' : 'error',
          result: result.ok ? result.feedback : undefined,
          error: result.ok ? undefined : (result.error ?? result.summary),
        });
      } else {
        const preview = await previewWriteCall(state.call);
        if ('ok' in preview) {
          // Preview itself failed (bad path, no match, …) — no approval needed.
          patchToolCall(assistantId, state.callId, {
            status: 'failed',
            summary: preview.summary,
            error: preview.error,
            feedbackFull: preview.feedback,
          });
          autoFeedback.push({ tool: state.tool, status: 'error', error: preview.feedback });
        } else {
          patchToolCall(assistantId, state.callId, {
            preview,
            summary:
              preview.kind === 'new-file'
                ? `New file: ${preview.path}`
                : `${preview.path}: +${preview.diff?.added ?? 0} / −${preview.diff?.removed ?? 0}`,
          });
          hasPendingWrites = true;
        }
      }
    }

    if (hasPendingWrites) {
      // Pause the loop until the user resolves every pending approval.
      // maybeResume() rebuilds the full feedback (incl. read-only results).
      set({ phase: 'awaiting-approval' });
      return;
    }

    // No approvals needed — feed read-only results back and continue.
    const feedbackMessage: AgentMessage = {
      id: nextMessageId('user'),
      role: 'user',
      content: buildToolFeedbackMessage(autoFeedback),
      status: 'complete',
      hidden: true,
      createdAt: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, feedbackMessage], turnCount: s.turnCount + 1 }));
    await streamTurn();
  }

  function appendNote(content: string): void {
    set((s) => ({
      messages: [
        ...s.messages,
        { id: nextMessageId('note'), role: 'note', content, status: 'complete', createdAt: Date.now() },
      ],
    }));
  }

  return {
    messages: [],
    phase: 'idle',
    turnCount: 0,
    activeProviderId: null,
    activeModel: null,
    modelPrefLoaded: false,
    sessionLoaded: false,
    draft: null,
    lastAppliedEdit: null,

    async hydrateSession() {
      if (get().sessionLoaded) return;
      set({ sessionLoaded: true });
      sessionHydrated = true;
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as AgentMessage[];
          const restored = sanitizeRestored(parsed);
          if (restored.length > 0) {
            set({ messages: restored, phase: 'idle', turnCount: 0 });
          }
        }
      } catch {
        // corrupt payload → start fresh
      }
    },

    async loadModelPref() {
      if (get().modelPrefLoaded) return;
      try {
        const raw = await AsyncStorage.getItem(MODEL_PREF_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { providerId?: string; model?: string };
          set({ activeProviderId: parsed.providerId ?? null, activeModel: parsed.model ?? null });
        }
      } catch {
        // ignore corrupt pref
      }
      set({ modelPrefLoaded: true });
    },

    selectModel(providerId, model) {
      set({ activeProviderId: providerId, activeModel: model });
      void AsyncStorage.setItem(MODEL_PREF_KEY, JSON.stringify({ providerId, model })).catch(
        () => undefined,
      );
    },

    newChat() {
      cancelledRunId = runCounter; // stop any in-flight run
      set({ messages: [], phase: 'idle', turnCount: 0 });
    },

    async sendMessage(text) {
      const trimmed = text.trim();
      if (!trimmed || get().phase !== 'idle') return;
      const userMessage: AgentMessage = {
        id: nextMessageId('user'),
        role: 'user',
        content: trimmed,
        status: 'complete',
        createdAt: Date.now(),
      };
      set((s) => ({ messages: [...s.messages, userMessage], turnCount: 0 }));
      await streamTurn();
    },

    cancelRun() {
      cancelledRunId = runCounter;
      set((s) => ({
        phase: 'idle',
        messages: s.messages.map((m) =>
          m.status === 'streaming' ? { ...m, status: 'cancelled' } : m,
        ),
      }));
    },

    async approveToolCall(messageId, callId) {
      const state = get().messages.find((m) => m.id === messageId)?.toolCalls?.find((c) => c.callId === callId);
      if (!state || state.status !== 'pending-approval' || !state.preview) return;

      patchToolCall(messageId, callId, { status: 'running', summary: 'Applying…' });
      const result = await applyWriteCall(state.call, state.preview);
      patchToolCall(messageId, callId, {
        status: result.ok ? 'applied' : 'failed',
        summary: result.summary,
        error: result.error,
        resultPreview: result.feedback.slice(0, 1_500),
        feedbackFull: result.feedback,
      });
      if (result.ok) {
        // Phase 5: the editor reveals the first changed line.
        set({
          lastAppliedEdit: {
            path: state.preview.path,
            firstNewLine: result.firstChangedLine ?? 1,
          },
        });
      }
      await maybeResume(messageId);
    },

    rejectToolCall(messageId, callId) {
      const state = get().messages.find((m) => m.id === messageId)?.toolCalls?.find((c) => c.callId === callId);
      if (!state || state.status !== 'pending-approval') return;
      patchToolCall(messageId, callId, {
        status: 'rejected',
        summary: 'Rejected by user',
      });
      void maybeResume(messageId);
    },

    async retryLast() {
      if (get().phase !== 'idle') return;
      const msgs = get().messages;
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== 'assistant' || last.status !== 'error') return;
      set({ messages: msgs.slice(0, -1) });
      await streamTurn();
    },

    setDraft(text) {
      set({ draft: text });
    },

    clearAppliedEdit() {
      set({ lastAppliedEdit: null });
    },
  };
});

/** Debounced session persistence (after hydration, skips transient fields). */
let sessionPersistTimer: ReturnType<typeof setTimeout> | null = null;
useAgentStore.subscribe((state) => {
  if (!sessionHydrated) return;
  if (sessionPersistTimer) clearTimeout(sessionPersistTimer);
  sessionPersistTimer = setTimeout(() => {
    void AsyncStorage.setItem(SESSION_KEY, JSON.stringify(serializeSession(state.messages))).catch(
      () => undefined,
    );
  }, 600);
});

/** Selector: everything the chat header should display. */
export function agentTargetLabel(): string {
  const registry = useProviderRegistry.getState();
  const agent = useAgentStore.getState();
  const provider =
    (agent.activeProviderId ? registry.getProvider(agent.activeProviderId) : undefined) ??
    getDefaultProvider();
  if (!provider) return 'No provider';
  const model =
    agent.activeProviderId === provider.id && agent.activeModel
      ? agent.activeModel
      : (provider.defaultModel ?? provider.models[0]?.id);
  return model ? `${provider.name} · ${model}` : provider.name;
}
