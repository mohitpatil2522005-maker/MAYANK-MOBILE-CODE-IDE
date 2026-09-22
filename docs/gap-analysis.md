# Mayank IDE — Gap Analysis vs `masterprompt.md` (v2 spec, M0–M12)

**Date:** 2026-09-22 · **Basis:** full read of `masterprompt.md` (1414 lines) + complete audit of
`MayankIDE/` source (~3.7k lines) + 232 automated checks (7 unit suites + 1 golden-session
suite) + Metro web-bundle compilation (1,137 modules).

Legend: ✅ implemented & verified · 🟡 partial · ❌ not started.

---

## 1. What was ADDED in this session (and is now verified)

| Item | Spec ref | Status | Evidence |
|---|---|---|---|
| **Agent modes** — Ask / Plan / Agent / Goal with contractual semantics: read-only enforcement (write/edit calls rejected with structured feedback), per-mode step caps (ask 6, plan 8, agent 8, goal 24), mode section injected into the system prompt, mode selector UI (chips + blurb) in the Agent tab, persisted | §9.2 | ✅ | golden session suite: "ask mode" + "agent mode" + cap sections |
| **Session usage meter** — estimated input/output tokens per chat (estimate mode, labeled `est.`), model-call count, reset by New Chat, shown in the status strip | §8.3 (min.) | ✅ | golden: "usage" checks |
| **Agent activity audit log** — every tool decision (auto-executed / pending / approved / rejected / failed / mode-blocked) with tool, target, mode; capped ring (200) persisted on-device; **Settings → Agent activity** viewer with copy-log + clear; no file contents or secrets stored | §9.3b | ✅ | golden: audit checks; settings UI |
| **Golden-session test suite** — scripted agent runs through the *real* app code (agent store loop, SSE transport/parse, tool executor, approval gating, demo FS) against a fake provider | §13.5 | ✅ | `tests/golden.test.ts` (44 checks), built via esbuild + Node-safe stubs |
| **Bug fix: safety cap bypass** — the approval-resumed turn no longer skipped the iteration counter; an approving loop is now capped (previously unbounded) | §9.3 | ✅ | golden: "safety cap applies to the approval loop" |
| **Bug fix: `read_file` read disk, not the editor buffer** — now the open (dirty) tab wins, consistent with search/write-preview | §9.8 | ✅ | code + golden uses same path |
| **Bug fix: internal `note` messages leaked into model history** — notes are now UI-only | §9.1 | ✅ | golden: "note message not sent to model" |
| **Bug fix: streaming text hidden after closed json fences** — only an *unclosed* trailing tool block is hidden while streaming | §9.8 (display) | ✅ | `tests/tools.test.ts` (4 regression cases added) |
| **Bug fix: demo-project root not routed to FS layer** — agent `write_file` (new file) failed with "No project open" on the demo project (web + native); shared `demoRootActive` flag now kept in sync by the project store | §9.8 / §6.1 | ✅ | code path exercised by golden reject-path (new-file preview) |

### Verified working (evidence)
- `npx tsc --noEmit` → 0 errors.
- `npm test` → **232 passed, 0 failed** (fuzzy 17 · providers 25 · session-export 19 · settings 29 · sse+extractors 31 · theme 33 · tools+diff+prompt 34 · golden 44).
- Metro web bundle compiles: 1,137 modules, ~6.7 MB.
- Live web preview serving on the sandbox port.
- Runtime caveat: this sandbox has no headless browser (binary CDNs blocked), so UI-level
  interaction was verified by code audit + bundle compile + logic-level suites, **not** by
  clicking through Chrome. The 10-item manual checklist at the bottom covers that delta.

---

## 2. Module-by-module status

### M0 — Foundations
| Item | Spec | Status | Gap |
|---|---|---|---|
| Repo layout + docs | §3.2 | 🟡 | `docs/status.md` + this file added; missing: `docs/architecture.md`, `adr/`, `assumptions.md`, `gotchas.md`, `plans/` |
| Design-token package | §13.4 | ❌ | App has a working `Palette` (`src/constants/theme.ts`) but no token package/component inventory |
| Error taxonomy | §3.5 | ❌ | Errors are plain strings; no typed error classes + user-behaviour map |
| Redacting logger | §3.5 | 🟡 | `sanitizeSnippet` redacts keys in SSE errors only; no central logger |
| i18n scaffolding | §12 | ❌ | English-only strings inline |
| Maestro E2E | §14 | ❌ | None |

### M1 — Responsive workbench shell (§4)
| Item | Status | Gap |
|---|---|---|
| Responsive breakpoints | 🟡 | Single `wide ≥ 768` split; spec wants compact/medium/expanded topology |
| Command palette | ✅ | Quick-open + commands + `Ctrl/Cmd+P` / `Shift+P` |
| Navigation rail / side-bar views | ❌ | No rail; tree is an overlay/side panel only |
| Agent HUD (side panel, thumb-first) | ❌ | Agent is a tab; no persistent HUD with task list |
| Touch editing layer (§4.6) | ❌ | No cursor wheel, loupe, multi-cursor, tap-hold handles |
| Snippets/Emmet/ghost text/smart paste | ❌ | Vim mode exists (extension); rest absent |
| Haptics & micro-interactions | 🟡 | `src/lib/haptics.ts` + tap feedback on key actions; no motion system |
| Perf & battery budgets in CI | ❌ | No budgets, no `react-native-performance` |

### M2 — Editor core (§5)
| Item | Status | Gap |
|---|---|---|
| CodeMirror 6 | ✅ | Web: `@uiw/react-codemirror` + 12-language Lezer; native: WebView bridge (`CodeEditor.web.tsx` / `CodeEditor.tsx`) |
| Editor host bridge API (§5.2) | 🟡 | WebView bridge exists (value/selection/cursor/reveal) but not the full documented surface |
| Folding, breadcrumbs, minimap-ish | 🟡 | Breadcrumbs ✅; CM6 folding default-on; no minimap |
| Diagnostics / Problems sheet | ❌ | No diagnostics pipeline (spec: linters per language tier) |
| **Diff editor view** | ❌ | Diffs only render in agent tool cards (`ToolCallCard`); no full diff pane |
| Crash recovery (undo journal) | ❌ | None |

### M3 — Files, search, source control (§6)
| Item | Status | Gap |
|---|---|---|
| VFS: demo + real folders | ✅ | Web File System Access + Android SAF + iOS sandbox; demo in-memory |
| VFS providers (SFTP etc.) | ❌ | Out of scope for now |
| **Index worker + workspace search view + find&replace** | ❌ | Only agent `search_code` tool + palette quick-open; no interactive search UI, no replace |
| Problems panel | ❌ | — |
| Project trust mode | ❌ | — |
| **Git (isomorphic-git)** | ❌ | Entirely missing (status/branch/diff/stage/commit UI) |

### M4 — Multi-provider AI (§8)
| Item | Status | Gap |
|---|---|---|
| Provider adapters (OpenAI/Anthropic/Google/Groq/custom) | ✅ | Full SSE streaming, model lists, test-connection |
| Keys in OS keychain (+biometric gate) | 🟡 | Native keychain + `BIOMETRY_ANY_OR_DEVICE_PASSCODE`; web deliberately in-memory (documented) |
| Settings → Providers UX | ✅ | Add/edit/remove, model fetch, default, biometric toggle |
| **Fallback router / model routing** | ❌ | Single active model; no fallback chain |
| **Usage ledger + Credits screen** | 🟡 | Per-session estimate meter added this session; no persistent ledger, no cost/credits screen (local models = free per spec) |

### M5 — Agent runtime (§9)
| Item | Status | Gap |
|---|---|---|
| Session model + persistence | ✅ | Last 80 msgs, debounced; graceful degrade on restore; Markdown export |
| **Modes** | ✅ | Added this session (contractual read-only enforcement + caps) |
| Agent loop + approval gating | ✅ | 6 read-only auto tools; write/edit always diff-preview → Approve/Reject; loop now capped on **all** paths |
| **Permission engine (rules/allow-lists)** | 🟡 | Two-level (auto vs approve) only; no user-defined rules, no "always allow this path" |
| **Audit log** | ✅ | Added this session |
| Resumable across app restart | 🟡 | Session restores but pending approvals degrade to "failed" (re-propose) rather than resume |
| Step cap | 🟡 | Per-mode caps (6–24) vs spec's 60-step goal budget |
| Agents Space / Agent Manager | ❌ | No agent personas/manager |
| Task Groups | ❌ | — |
| Slash commands | ❌ | — |
| Tool registry | 🟡 | 6 tools (read_file, list_files, search_code, write_file, edit_file, explain_selection); no browser/terminal/artifact tools |
| Context builder (caps, file refs) | ✅ | 12k/4k/14k budgets, 2-level tree, file-ref extraction |
| **Checkpoints / Review Changes / rollback** | ❌ | No checkpointing |
| Rules / skills / workflows / subagents | ❌ | — |

### M6 — Artifacts & browser tool (§10)
❌ Entirely missing (artifact model, preview surfaces, in-app browser tool).

### M7 — Terminal / tasks / debug-lite (§7)
❌ Entirely missing. (Spec allows honest scoping — but nothing exists.)

### M8 — Extension runtime (§11/§16)
| Item | Status | Gap |
|---|---|---|
| Themes "marketplace" | 🟡 | 4 built-in themes with live preview (Extensions tab) — marketplace-shaped, but no external extensions |
| Worker-host runtime + API surface | ❌ | None (no `ExtensionAPIUnsupported` contract, no manifest schema) |
| Extension API docs + schema | ❌ | Missing deliverables `docs/extension-runtime.md` + manifest schema |

### M9 — MCP / skills / i18n / a11y (§12)
| Item | Status | Gap |
|---|---|---|
| Accessibility | 🟡 | `accessibilityLabel/Role` on essentially all interactive controls; no VoiceOver/TalkBack pass, no contrast audit |
| i18n | ❌ | — |
| MCP client | ❌ | — |

---

## 3. What is LEFT (recommended build order)

**P0 — biggest user-facing gaps, buildable on current architecture:**
1. **Search view + find & replace + index** (§6.2) — the workbench feels unfinished without it.
2. **Git** (§6.3) — isomorphic-git + source-control tab (status → stage → commit; branches later).
3. **Diff editor view** (§2) — promote the agent's diff card to a full split diff pane (reuses `src/lib/diff.ts`).
4. **Responsive shell**: rail + agent HUD (§4.1/§4.4) — mobile-first topology per breakpoints.

**P1 — agent-depth parity:**
5. Permission-engine rules ("always allow edits in `src/`", per-tool) + "always-approve" per session.
6. Checkpoints + Review Changes/rollback (§9.10).
7. Persistent usage ledger + Credits screen (§8.3) once provider-reported usage is plumbed (adapters don't parse `usage` today — estimates only).
8. Provider fallback router (§8.2).
9. Session resume of pending approvals across restarts (§9.3).

**P2 — new surfaces (each is its own milestone):**
10. Artifacts + in-app browser tool (§10) · Terminal/tasks/debug-lite (§7) ·
    Extension worker runtime + marketplace (§11/§16) · MCP + skills (§12).

**Cross-cutting (do alongside P0):** error taxonomy + redacting logger (M0), ADR/assumptions
docs, design-token extraction from the existing palette, Maestro golden-path suite.

---

## 4. Manual verification checklist (do in the live preview)

Headless-browser testing wasn't possible in this sandbox; verify these by hand:
1. Editor: open demo project → edit a file → Cmd/Ctrl+S → tab dirty dot clears.
2. Command palette: Cmd/Ctrl+P → type a file name → Enter opens it.
3. Markdown preview toggle on `README.md`.
4. Agent tab: mode chips switch (Ask/Plan/Agent/Goal) and blurb updates; preference persists on reload.
5. Agent tab: with no provider configured → setup CTA appears; add a custom provider (e.g. Ollama) in Settings.
6. Settings → **Agent activity**: entries appear after any agent run; Copy log + Clear work.
7. Agent: send a message with a real key → stream renders; read-only tools auto-run; a `write_file` proposal shows diff + Approve/Reject; approving opens/reveals the changed line in the editor.
8. Status strip shows `N calls · ~X in / Y out (est.)`.
9. Kill the tab mid-stream → Stop button; session restores on reload (pending approvals degrade gracefully).
10. Web (Chrome/Edge): "Open folder" real-folder round-trip (save a file, confirm on disk).
