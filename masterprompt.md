# 🧠 MASTER PROMPT — Mayank IDE
## An Agent-First, Touch-First Mobile IDE (Google Antigravity + VS Code class)

> **Version:** 2.0 (supersedes v1.0, preserved at `masterprompt.v1-backup.md`)
> **Audience:** the implementing AI coding agent (Cline / Claude Code / GPT-class) **and** every human engineer who joins the project.
> **Contract:** Read this entire document before writing code. It is simultaneously the product specification, the architecture spec, and your working agreement. Where this document is silent, choose the option that is (a) simplest, (b) most reversible, (c) most testable — and record the decision in `/docs/adr/`.

---

## 0. HOW TO USE THIS PROMPT

### 0.1 Your role
Act as a **staff-level mobile IDE architect + senior React Native/TypeScript engineer** who has shipped: a CodeMirror/Monaco-based editor, an LSP client, an agentic tool-calling loop, and a BYOK secret-storage layer. You are not a code generator that dumps files: you plan, justify, implement in small vertical slices, test every slice, and report honestly about verified vs. assumed.

### 0.2 Operating rules (non-negotiable)
1. **Plan before code.** For every milestone emit `/docs/plans/M<n>.plan.md`: scope, out-of-scope, file-by-file change list, data contracts touched, test plan, rollback plan, open questions. Get human sign-off on HIGH-RISK plans before implementing.
2. **Small vertical slices.** One slice = one user-visible behaviour = one PR ≤ ~500 changed LOC. Never land a slice that leaves the app unbuildable.
3. **Test-first for logic.** Permission matcher, diff/hunk applier, SSE streaming parser, provider adapters, git adapter, artifact store, path normalizer: failing Jest test first, then implementation, then refactor.
4. **No placeholders in shipped code.** No `TODO`, no `throw new Error('not implemented')`, no fake success paths, no stubbed network calls that pretend to pass. If blocked, say so and open a blocking issue instead of faking it.
5. **No invented APIs.** Verify every dependency exists at the version you pin (`npm view <pkg> version`) and read its real API surface. If a library cannot run on Hermes/iOS/Android, choose another and document why in an ADR.
6. **Mobile is not desktop.** Any behaviour requiring process spawn, filesystem mount, hover state, right-click, or desktop-only Node APIs is **out of scope** unless this document defines the mobile-safe alternative (see §1.4 and §7).
7. **Thumb-first UX.** Every primary action reachable one-handed on a 5.5–6.7" screen in bright sunlight. Tap targets ≥ 44×44 dp (iOS) / 48×48 dp (Android). No action may require two hands, hover, or precise touches under 20 px.
8. **Offline-first.** Editor, file tree, git status, syntax highlighting, search, and installed extensions all work with zero network. Network features degrade behind an explicit non-blocking banner — never a dead screen, never an infinite spinner.
9. **Never block the UI thread.** No synchronous FS, no heavy parsing, no `JSON.parse` of >2 MB payloads on the JS thread; use workers, chunked/yielding processing, `InteractionManager`. All animation on the UI thread via Reanimated 3 worklets only — the `Animated` API is banned.
10. **Secrets discipline.** API keys/tokens live only in `react-native-keychain` (iOS Keychain / Android Keystore). Never in MMKV, AsyncStorage, Zustand persist, logs, crash reports, telemetry, screenshots, or git. Every read is gated; every egress is audited (§12).
11. **Run the gates after every slice:** `typecheck`, `lint`, `unit tests`, and the relevant Maestro flow for UI slices. Paste the raw result summary in your status update.
12. **Update the ledger.** Append to `/docs/status.md`: milestone, slice, what changed, what is verified, what is mocked, what is next, blockers. The ledger is the single source of truth for progress.

### 0.3 Global Definition of Done (applies to *every* slice)
- [ ] Behaviour specified in this document is implemented, not approximated.
- [ ] Unit tests cover happy path + ≥2 edge cases + 1 failure path; changed-file coverage ≥ 80 %.
- [ ] E2E/flow test updated when user-visible navigation or gestures changed.
- [ ] Types exact (`strict: true`, no `any`, no unjustified non-null assertions).
- [ ] Accessibility: screen-reader labels, dynamic-type scaling, and a 200 % font-scale check.
- [ ] Performance: no new frame drops on the low-end Android reference device (profiler screenshot attached to PR).
- [ ] Offline path exercised once with network disabled.
- [ ] Docs updated: ADR (if a decision was made), `/docs/status.md`, and this prompt if a spec changed (§0.7).

### 0.4 Reporting format after each slice
```
SLICE:        <milestone-id>/<n> — <title>
FILES:        <created/modified counts + notable paths>
VERIFIED:     <commands run + observed result>
MOCKED/LIMITED: <what is not real yet and why>
DECISIONS:    <ADR ids>
BLOCKERS:     <none | blocking issue + what you need>
NEXT:         <next slice>
```

### 0.5 Stop and ask (do not guess) when
- A requirement contradicts another requirement here (precedence in §0.8).
- A needed library does not support Hermes/iOS/Android or requires a paid account.
- A credential, store account, signing key, backend endpoint, or domain is required.
- Work would alter the security model (§12), permission-engine semantics (§9.3b), or any published data contract (§16) without a version bump.
- Two plausible interpretations produce materially different UX.

Ask in this exact form, max 3 questions per stop:
```
QUESTION: <one sentence>
OPTIONS:  A) …  B) …  C) …
IMPACT:   <what changes downstream>
DEFAULT-IF-SILENT: <option + why>
```

### 0.6 Forbidden anti-patterns (auto-fail on review)
- `any` casts to silence the compiler; `@ts-ignore` without a linked issue.
- `Animated` API, `setInterval` polling, `useEffect`-driven animations.
- Secrets or file contents in Zustand persist / Redux / MMKV / AsyncStorage.
- WebView loading remote JS with `allowUniversalAccessFromFileURLs` or `allowFileAccess` enabled by default.
- Silent catch blocks (`catch {}`) or swallowed promise rejections.
- Feature flags default-on for unfinished paths.
- New dependency duplicating an existing capability without an ADR.

### 0.7 Keeping this document alive
When implementation proves a spec wrong, do **not** silently diverge. Update the section in place, add a `REV:` marker with date and author, and add an ADR explaining the change. A stale spec is a bug.

### 0.8 Precedence when specs conflict
1. Security & privacy (§12) — always wins.
2. Platform limits / store policy (§1.4) — defines what is achievable; adjust the spec, not reality.
3. Performance & battery budgets (§4.9, §13.5).
4. Accessibility (§13.3).
5. Feature parity goals (§1.2, §1.3).
6. Visual/aesthetic preference (can always be traded away).

### 0.9 Assumptions ledger
Every assumption you make that is not stated here goes into `/docs/assumptions.md` as:
`<id> | <assumption> | <why it is safe> | <how to falsify> | <expiry>`. Re-check expired assumptions at each milestone boundary.

### 0.10 Deliverables at project end (definition of *shipped*)
1. A working Expo app (iOS + Android) passing all gates on the device matrix (§2.4).
2. Extension runtime spec (`docs/extension-runtime.md`) + manifest schema (`docs/schemas/mayank-ide.manifest.schema.json`).
3. Provider adapter interface + reference adapters (`docs/providers.md`).
4. `CONTRIBUTING.md` explaining how to add a provider, an agent tool, a language support, and an extension.
5. Maestro E2E suite covering the golden path (§14.4).
6. CI workflows enforcing budgets and budgets report in each PR.
7. Design-token package + component inventory used by the app.

## 1. NORTH STAR, REFERENCES & SUCCESS METRICS

### 1.1 The one-sentence product
**Mayank IDE is a phone-native, agent-first coding environment**: the touch ergonomics of a first-class mobile editor, the workbench depth of VS Code, and the autonomous, artifact-driven agent workflow of Google Antigravity — usable one-handed, offline, on a train.

### 1.2 Reference parity map — Google Antigravity (agent surfaces)
These are the concepts we must reproduce in mobile form. Antigravity's own vocabulary is reused deliberately so docs, UI copy, and code names line up.

| Antigravity concept | What it means there | Mayank IDE equivalent |
|---|---|---|
| **Agent** | Multi-step reasoning system: reasoning model + tools + artifacts + knowledge | `AgentRuntime` (§9) with the same four pillars |
| **Agent Manager / Manager view** | Mission control for many parallel agent conversations across projects | **Agents Space** — a full-screen surface listing all `AgentSession`s (running/idle/needs-review/failed) with cross-project filters (§9.4) |
| **Agent Side Panel** | Right-hand panel: new conversations, image attach, mode switch, model picker, bottom toolbar showing open file changes / running processes / artifacts | **Agent HUD** bottom sheet with 4 snap points, converting to a side pane on `expanded` breakpoints (§4.4) |
| **Task Groups** | Groups of related tasks inside a conversation with per-task status | `TaskGroup` model: each agent turn creates a group of `AgentTask`s (todo → in-progress → done/blocked) rendered as a collapsible progress timeline (§9.5) |
| **Artifacts**: Implementation Plan, Walkthrough, Visual Screenshots, browser recordings, code diffs, architecture diagrams | Structured deliverables produced (mostly) during Planning Mode, reviewed asynchronously; supports inline feedback to steer | `Artifact` store + Review sheet, 8 artifact types, everything exportable/shareable (§10) |
| **Planning Mode** | Agent plans first; user reviews/steers before files change | `AgentMode.plan` — write-only-to-artifacts mode; no file mutation until approval (§9.2) |
| **Permissions engine** | Unified fine-grained engine with **Deny / Ask / Allow** lists; actions `read_file, write_file, read_url, execute_url, command, mcp`; wildcards + `regex:` prefix; implicit rules (write implies read; deny read implies deny write); interactive prompt cards with editable scope | Ported 1:1 with mobile actions added (§9.3b) and a touch-native prompt card with scope chips |
| **Browser tool + Browser Recordings + Allowlist/Denylist + Isolated Profile** | Agent drives a real browser, captures screenshots and action videos as artifacts; two-layer URL security; separate browser profile | In-app `BrowserSubagent` over `react-native-webview` with DOM/a11y snapshotting, action timeline recording, URL denylist+allowlist, isolated cookie jar (§10.4) |
| **Review Changes / checkpoints** | Review diffs before accepting; revert to a checkpoint | `Checkpoint` (git ref or virtual-FS patch) + Review Changes sheet with accept/reject per hunk (§9.10) |
| **Tab Completion** | Inline ghost-text completion in the editor | Ghost text + accept chip in the Keyboard Companion Toolbar (§4.6) |
| **Vim Editor Mode** | Modal editing | CM6 vim keymap, opt-in (§4.7) |
| **Slash commands** `/goal /grill-me /schedule /browser /agents /codesearch /diff /permissions /resume /statusline /title /usage /voice /boost /teamwork` | Scriptable agent controls typed into the prompt box | Same command surface, plus mobile-only `/checkpoint /revert /offline /budget /attach` (§9.7) |
| **MCP, Skills, Rules & Workflows, Custom Subagents, Lifecycle Hooks** | Extensibility of the agent itself | §11.8 (MCP) · §9.11 (skills, rules, workflows, subagents, hooks) |
| **AI Credits / quotas** | Usage accounting per model | `UsageLedger` + Credentials & Usage screen: tokens, est. cost, provider quota, per-session breakdown (§8.3) |
| **Projects (multi-folder workspaces)** | Project = boundary of folders/repos an agent may touch; cross-repo context | `Project` model with multiple roots, workspace trust, per-root permission scoping (§6.1) |
| **Workspace Trust** | Confirm trust before agent indexes/acts | First-open trust sheet: Trust / Restricted mode (§6.1, §12.3) |

### 1.3 Reference parity map — VS Code (workbench depth)
| VS Code capability | Mobile adaptation | Section |
|---|---|---|
| Activity Bar + Side Bar views | Icon rail + swipe-in drawer (compact) / pinned rail (expanded) | §4.2 |
| Explorer tree, breadcrumbs, tabs, split editors, minimap | Same topology, touch-tuned; minimap becomes a 24 px scroll indicator | §4.3, §5.3 |
| Command Palette (`⌘K ⌘⇧P`) | Native palette + hardware-keyboard support + prefix modes `@ > #` | §4.5 |
| Settings / keybindings / snippets JSON | Real `settings.json`, `keybindings.json`, `*.code-snippets` in a virtual `.mayank-ide/` workspace folder, editable in-app | §13.2 |
| Language server features (LSP) | Tiered: worker-based built-ins → remote LSP over WebSocket → index fallback | §5.4 |
| Debug (DAP), Tasks, Problem matchers, Terminal | Tasks + problem matchers fully; DAP-lite for JS/HTTP; terminal via remote PTY/cloud shell | §7 |
| Source Control panel, staging, diff editor | Full: status/diff/stage/commit/branch/stash/conflict resolution | §6.4 |
| Extension host, contributed points, activation events, marketplace | Sandboxed worker host + ported contribution points + Open VSX client | §11 |
| Remote (SSH/tunnels/dev containers) | Remote workspace profiles: SFTP/SSH workspace + Remote LSP/Terminal targets | §6.1, §7.1 |
| Sync (settings/profiles) | E2EE opt-in sync of non-secret config only | M12 (§14) |

### 1.4 What mobile reality changes (the "impossible on desktop" list)
Read this before arguing with a spec. Each row states the constraint, the required mobile-safe design, and what the agent must **not** attempt.

| Constraint | Mobile-safe design | Forbidden |
|---|---|---|
| No arbitrary process spawn (iOS prohibits; Android restricts) | Terminals/tasks attach to a **remote PTY** (SSH/cloud shell) or the built-in command surface; local "shell" only emulates a documented command subset | Bundling a Linux userland, `child_process`, spawning binaries |
| No real local language servers (Node/Python) | Tiered language intelligence: JS/TS via TypeScript compiler in a worker; JSON/CSS/HTML/Markdown via worker services; heavy languages via remote LSP | Bundling node/Python runtimes to run servers locally |
| Sandboxed filesystem, no mount points, scoped URI access | FS abstraction over `expo-file-system` + SAF (Android) / security-scoped bookmarks (iOS) + remote FS providers (§6.2) | Assuming POSIX paths, `fs.watch`, symlinks, executable bits |
| Free-form background execution is limited | Android: foreground service for long agent runs; iOS: `BGProcessingTask` for short continuations + resumable sessions; always show "agent paused" state | Promising unlimited background agents; polling loops to fake progress |
| Small screen, no hover, no right-click | Bottom sheets, long-press context menus, gesture vocabulary, contextual toolbars | Hover tooltips as the only way to discover something |
| Soft keyboard covers 40–55 % of screen | Keyboard Companion Toolbar + auto-scroll-to-caret + height-aware relayout | Fixed bottom controls that the keyboard hides |
| Battery, thermal, metered data | No polling, streaming-aware transport, debounced indexing, user-visible data-use controls | Continuous full-repo re-indexing, heartbeat pings |
| Clipboard/backup/screenshot leakage risk | Secret redaction, `FLAG_SECURE`-style protection for key screens, no secrets in backups | Storing secrets in files, printing them anywhere |
| App store rules | No dynamic code execution in the app binary; extensions run in a sandboxed worker with a capability manifest | JIT-compiling arbitrary native code from marketplace content |

### 1.5 Personas & jobs to be done
1. **Priya, senior mobile dev (train commuter, Android mid-range).** *Open a repo, fix a bug, push a branch one-handed while offline-ish.* Needs: fast cold start, thumb-reachable editing, offline queue for push, honest sync state.
2. **Marco, backend dev on iPhone (no laptop while travelling).** *Review and merge a small PR, run a remote test suite, approve an agent plan.* Needs: remote PTY + remote LSP, beautiful diffs, session resume across app restarts.
3. **Aisha, tech lead (tablet, expanded layout).** *Run three agents in parallel across two repos; review artifacts asynchronously.* Needs: Agents Space, Task Groups, artifact review with inline steering, per-agent cost visibility.
4. **Dev-rel / learner (phone only).** *Learn by prompting: ask an agent to build a small app, watch it plan, verify in the browser tool.* Needs: guided onboarding, artifacts as lessons (walkthroughs), forgiving undo/checkpoints.
5. **Enterprise admin.** *Enforce provider allowlists, block telemetry, rotate keys, audit tool usage.* Needs: MDM-compatible config, egress audit log, no BYOK exfiltration, policy file support.

### 1.6 Success metrics (product-level, instrumented per §13.6)
- **Activation:** ≥ 60 % of new users reach "first successful agent plan approved" within 10 minutes.
- **Retention:** D7 ≥ 25 %, D30 ≥ 12 % for editor+agent users.
- **Trust:** ≥ 70 % of agent sessions include at least one artifact review; revert-without-frustration (one revert, then success) ≥ 80 %.
- **Quality:** crash-free sessions ≥ 99.5 %; agent tool-call failure rate < 5 %; false "unsaved/unreliable" states = 0.
- **Performance:** cold start to editable < 2.5 s (mid-range Android); typing latency < 16 ms with a 5 000-line file; idle RSS < 250 MB.
- **Cost transparency:** 100 % of model calls attributable to a session with visible token/cost accounting.

### 1.7 Non-goals (v2.x — do not build)
- A local compiler/toolchain for arbitrary languages on-device.
- Full DAP debugging with breakpoint stepping for native languages (deliver DAP-lite: JS/Node remote, HTTP request debugging, logpoints).
- Notebook/Jupyter execution on-device (remote kernel attach only, future).
- A social/community feed, code-hosting service, or CI runner.
- Arbitrary native-code execution by extensions.
- Perfect Open VSX/VS Code API compatibility — we implement a declared, documented subset (§11.2) and reject the rest with a clear message.

## 2. TECH STACK, PLATFORMS & ENVIRONMENT

### 2.1 Pinned stack (verify latest patch at implementation time and pin in `package.json`)
**Framework & runtime**
- React Native + **Expo SDK 52+** (managed workflow with a Custom Dev Client via `expo-dev-client`; EAS Build for CI artifacts).
- **Expo Router** (file-based routing: `app/` with groups `(workspace)`, `(agents)`, `(settings)`, modals as `+modal` routes).
- **Hermes** engine only. New Architecture (Fabric/TurboModules) enabled. iOS ≥ 16, Android ≥ 8.0 (`minSdkVersion 26`).
- TypeScript `strict: true`, `noUncheckedIndexedAccess`, path aliases `@core`, `@features`, `@shared`, `@platform`.

**State & storage**
- **Zustand** for app state; `zustand/persist` (via MMKV adapter) **only for non-sensitive UI state**: layout prefs, theme, open tabs, agent conversation history, recent files, cursor positions.
- **react-native-mmkv** (v3, sync API) for hot-path reads: recent files, per-file cursor/scroll positions, feature flags cache, model-list cache keyed by endpoint URL.
- **expo-sqlite** for structured data: workspace index (files, symbols, FTS5 search), artifact metadata, telemetry queue, usage ledger.
- **react-native-keychain** for secrets only (§12.1).
- **expo-file-system** (`/next` async API) for all file IO; **no** synchronous APIs in production paths.

**UI, motion, input**
- **React Native Reanimated 3** (worklets, shared values) + **react-native-gesture-handler 2** for every gesture and sheet.
- **@gorhom/bottom-sheet** for HUD sheets (snap points), custom Reanimated sheets for the drawer.
- **lucide-react-native** icons; **react-native-svg** for icons/diagrams/minimap; **expo-haptics**, **expo-local-authentication**, **expo-clipboard**, **expo-sharing**, **expo-document-picker**, **expo-image-picker**, **expo-secure-store** (fallback), **expo-notifications**, **expo-background-task**, **expo-keep-awake**.
- **react-native-safe-area-context**, **@shopify/flash-list** for every long list, **react-native-webview** for the editor/terminal/browser sandboxes.

**Editor, language, agent engines**
- **CodeMirror 6** as the primary editor engine, mounted inside a single long-lived WebView ("Editor Host") with a **typed `postMessage` bridge** (§5.2). Rationale: CM6's Lezer grammars, incremental parsing, and mobile-safe input handling beat Monaco on a phone; Monaco remains an opt-in compatibility mode behind the same bridge contract.
- Languages: **Lezer grammars** bundled directly; **tree-sitter WASM** (`web-tree-sitter`) only for languages without a Lezer grammar; **@typescript/vfs + typescript** compiler in a Web Worker for JS/TS intelligence.
- **@uiw/react-codemirror** is *not* used in the native tree (we control the WebView bridge); it may be used for a quick prototype only.
- Search: **ripgrep compiled to WASM** (`@vscode/ripgrep-wasm`-style build or `ripgrep-wasm`), FTS5 for indexed search, WASM fuzzy matcher (fzf-style) for Quick Open.

**Git & terminal**
- **isomorphic-git** with custom `fs` (expo-file-system) and `http` (RN fetch + auth) adapters; **diff** via `jsdiff` + `diff-match-patch` (word-level); conflict UI custom-built.
- Terminal rendering: **xterm.js** in a WebView; transport: remote PTY over SSH (`react-native-ssh-sftp` native module or WASM SSH) or cloud-shell WebSocket. No local process spawning (§7.1).

**AI**
- Provider HTTP via `fetch` + streaming via `react-native-sse` (SSE) and WebSocket where required; every adapter implements `ProviderAdapter` (§8.1).
- Tool-calling: native function calling where the provider supports it; a strict JSON-mode fallback plan for providers that do not, with schema repair + one retry.

**Tooling & quality**
- Jest + `@testing-library/react-native`; **Maestro** for E2E (primary, cross-platform) with Detox as optional iOS-only visual regression layer.
- ESLint (`eslint-config-expo` + custom boundary rules), Prettier, `tsc --noEmit`, `dependency-cruiser` for architecture-boundary enforcement (§2.3), Husky + lint-staged.
- Sentry (or equivalent) with **PII scrubbing and code-content exclusion**; `expo-updates` for OTA; remote config for flags.
- CI: GitHub Actions — typecheck, lint, unit, dependency-cruiser, Maestro flows on emulator, EAS build of the dev client, budget report comment on PR (§14.5).

### 2.2 Hard rejections (do not adopt)
- Redux/MobX (Zustand is chosen), `react-native-fs` (superseded), `Animated` API, `react-native-fs-watcher`, `electron`-style node polyfills, `sqlite3` native, any library requiring a private native fork, any GPL-incompatible license, any "AI SDK" that hides the raw HTTP shape we must control for BYOK (§8.1).

### 2.3 Architecture boundaries (enforced by dependency-cruiser, CI fails on violation)
```
shared  ←  core  ←  features  ←  app
shared  ←  platform
core    ✗  features   (core may never import a feature)
features ✗ features   (features communicate through core services or events)
platform ✗  features  (platform only implements core interfaces)
```
Rule of thumb: **if two features need the same logic, it moves to `core`.**

### 2.4 Device matrix (test targets; per-PR smoke = row 1–2)
| Tier | Device | OS | Purpose |
|---|---|---|---|
| A — low-end Android reference | Pixel 4a / Galaxy A14 class (4 GB RAM) | Android 13–15 | All performance budgets enforced here |
| B — mid iPhone reference | iPhone 12/13 class | iOS 16–18 | Gesture/keyboard/safe-area correctness |
| C — small screen | iPhone SE (3rd gen) / 5.4" Android | latest −1 | Layout compression, keyboard overlap |
| D — expanded | iPad 10.9" + Android tablet, plus ≥ 840 dp window | latest | Rail layout, split editor, Agents Space |
| E — hardware keyboard | Any A/D device + Bluetooth keyboard | latest | Palette shortcuts, Tab-in-editor, Vim mode |

## 3. SYSTEM ARCHITECTURE

### 3.1 Process & thread model (know where your code runs)
```
┌─ NATIVE SHELL (iOS / Android) ──────────────────────────────┐
│  RN UI Thread (Fabric)   ← Reanimated worklets, gestures    │
│  RN JS Thread (Hermes)   ← React render, Zustand, adapters  │
│  Native modules: filesystem, keychain, biometrics, share    │
└─────────────────────────────────────────────────────────────┘
   │ postMessage (typed bridge, §3.3)
┌──┴─ HOST PROCESSES (WebView / Worker sandboxes) ────────────┐
│  1 Editor Host      → CodeMirror 6 + Lezer + tree-sitter     │
│  2 Language Worker  → typescript/vfs, JSON/CSS/HTML services │
│  3 Index Worker     → ripgrep-wasm, FTS writer, ctags tree   │
│  4 Terminal Host    → xterm.js + PTY stream renderer         │
│  5 Browser Host     → react-native-webview + DOM automation  │
│  6 Extension Host   → one Web Worker per extension (sandbox) │
└─────────────────────────────────────────────────────────────┘
```
**Rules:** hosts are long-lived (mount once, reuse, never remount per file); hosts own only **view state** (scroll, selection, undo stack, render buffers) — never app state; every host has a versioned protocol and a documented crash-recovery path; a dead host never kills the app — it is remounted and its state replayed from the JS side.

### 3.2 Repository structure (target layout)
```
mayank-ide/
├─ app/                          # Expo Router routes only (thin: no business logic)
│  ├─ (workspace)/index.tsx      # editor shell
│  ├─ (workspace)/agents.tsx     # Agents Space (Agent Manager parity)
│  ├─ (workspace)/review.tsx     # Review Changes
│  ├─ (agents)/[sessionId].tsx   # Agent session detail / Task Groups
│  ├─ (settings)/providers.tsx | editor.tsx | keybindings.tsx | extensions.tsx
│  │               | security.tsx | usage.tsx | about.tsx
│  └─ +modal/*.tsx               # palette, artifact viewer, permission prompt, sheets
├─ src/
│  ├─ core/
│  │  ├─ editor/       # bridge client, doc model, cursor engine, snippets, Emmet, decorations
│  │  ├─ languages/    # grammar registry, LSP clients, TIERS (§5.4), diagnostics aggregator
│  │  ├─ fs/           # VFS, providers (local/SAF/iCloud/SFTP/GitHub), watchers, encoding, paths
│  │  ├─ search/       # indexer, FTS queries, fuzzy matcher, replace engine, ReDoS guard
│  │  ├─ git/          # isomorphic-git wrapper: status, diff, stage, commit, branch, stash, conflicts
│  │  ├─ ai/           # ProviderAdapter impls, streaming, tool-calling, router, usage ledger, prompts
│  │  ├─ agent/        # AgentRuntime, modes, task groups, context builder, checkpoints, hooks
│  │  ├─ tools/        # AgentTool registry: fs, search, terminal, git, browser, mcp, extension
│  │  ├─ permissions/  # engine: rules, matcher, implicit rules, prompt queue, audit log
│  │  ├─ artifacts/    # ArtifactStore, renderers, exporters, media handling
│  │  ├─ extensions/   # manifest parser, host supervisor, API surface, OpenVSX client, installer
│  │  ├─ mcp/          # client transports (streamable HTTP/SSE), tool bridge, OAuth, policies
│  │  └─ keychain/     # secret store, biometric gate, rotation, redaction
│  ├─ features/
│  │  ├─ shell/           # drawer/rail, explorer, search view, SCM view, status bar, tab bar
│  │  ├─ editor-view/     # Editor Host mount, minimap indicator, diagnostics UI, diff view
│  │  ├─ keyboard-toolbar/# symbol rail, action row, ghost-text accept chip
│  │  ├─ agent-hud/       # chat sheet, context pills, tool cards, plan approval, task groups
│  │  ├─ agents-space/    # multi-session dashboard, cross-project filters
│  │  ├─ artifacts/       # artifact list, viewer, review/steer, export/share
│  │  ├─ browser-tool/    # browser host UI, recordings, allow/deny UI
│  │  ├─ terminal/        # tab strip, session picker, xterm host mount
│  │  ├─ source-control/  # changes tree, diff editor, commit composer, conflicts
│  │  ├─ command-palette/ · marketplace/ · settings/ · onboarding/
│  ├─ shared/
│  │  ├─ ui/         # primitives: Button, Sheet, Chip, Card, Toast, Loupe, Skeleton, EmptyState
│  │  ├─ design/     # tokens, theme provider, typography scale, motion presets
│  │  ├─ gestures/   # gesture vocabulary, recognizers, conflict resolution
│  │  ├─ hooks/      # useBreakpoint, useHaptics, useKeyboardRect, useDebounced, useBackHandler
│  │  ├─ store/      # Zustand slices + persistence boundaries
│  │  ├─ log/        # logger with redaction, ring buffer, export bundle
│  │  └─ errors/     # error taxonomy, boundaries, user-facing mapping
│  └─ platform/      # .ios.tsx / .android.ts native implementations of core interfaces
├─ workers/          # worker + WebView host sources (editor, language, index, terminal, extension)
├─ assets/           # fonts (JetBrains Mono / JetBrains Mono NL), icons, onboarding art
├─ docs/             # adr/, plans/, status.md, assumptions.md, schemas/, extension-runtime.md
├─ e2e/              # Maestro flows + fixtures
└─ scripts/          # build workers, verify budgets, seed demo workspace
```

### 3.3 Host bridge protocol (one contract, six hosts)
All host communication uses this envelope, versioned per host, with request/response plus event channels:
```ts
type Envelope<T = unknown> = {
  v: 1;                        // protocol version; mismatch ⇒ host killed & reloaded
  host: 'editor' | 'language' | 'index' | 'terminal' | 'browser' | 'extension';
  kind: 'req' | 'res' | 'evt';
  id: string;                  // uuid; correlates req/res
  method?: string;             // for req/evt
  ok?: boolean;                // for res
  payload?: T;
  error?: { code: HostErrorCode; message: string; detail?: unknown };
  seq?: number;                // monotonic per stream (events)
  ts: number;
};
```
Requirements: every `req` has a **timeout** (default 10 s, per-method override) and a typed error result; streaming events carry `seq` and the receiver must detect gaps and request a resync; payloads > 256 KB are chunked or passed as a **blob handle** (`{ blobId }` → temp file path) — never a giant JSON string; all message types live in `src/core/<host>/protocol.ts` and are covered by contract tests (same fixtures consumed by host and client test suites).

### 3.4 State ownership matrix (no duplicated truth)
| State | Owner | Persistence |
|---|---|---|
| Document text + undo stack | Editor Host | Saved to disk on save; crash snapshot to temp |
| Selection / cursor / scroll | Editor Host (view) + JS mirror for status bar | MMKV per file (debounced 500 ms) |
| Open tabs, layout prefs, theme | Zustand (JS) | `zustand/persist` → MMKV |
| Project roots, trust state | Zustand + SQLite | SQLite |
| Agent sessions, tasks, artifacts metadata | SQLite (+ Zustand cache) | SQLite |
| Artifact payloads (markdown, diffs, images, recordings) | Filesystem `.mayank-ide/artifacts/` | Filesystem |
| Secrets | Keychain | Keychain |
| Index (files/symbols/FTS/embeddings refs) | SQLite, written by Index Worker | SQLite |
| Model list cache, feature flags | MMKV | MMKV |
| Usage & cost ledger | SQLite | SQLite |
| Terminal scrollback | Terminal Host ring buffer (10 k lines) | Off by default |

### 3.5 Error taxonomy & user-facing behaviour
| Code | User-facing behaviour |
|---|---|
| `AUTH_FAILED` | Card with "Re-authenticate" CTA; keep queued work |
| `RATE_LIMITED` | Queue request, countdown chip, offer fallback model/provider |
| `QUOTA_EXHAUSTED` | Explain quota + link to usage; offer cheaper/fallback model |
| `CONTEXT_TOO_LONG` | Auto-summarize with "what was dropped" preview; let user trim pills |
| `NETWORK_OFFLINE` | Offline banner, request queued, exponential backoff with jitter |
| `FS_PERMISSION_DENIED` | Re-prompt SAF / iCloud consent with plain-language explanation |
| `PATH_NOT_FOUND` | Refresh tree, offer to create the file |
| `GIT_CONFLICT` | Open conflict resolver; never leave repo in a broken state silently |
| `TOOL_DENIED_BY_POLICY` | Explain the matching rule; "widen scope" action with explicit confirmation |
| `HOST_CRASHED` | Silent auto-remount; replay state; show a subtle toast if user-visible data was affected |
| `INVALID_MODEL_OUTPUT` | Schema repair + one retry; then surface raw output with a copy button |
| `EXTENSION_FAULT` | Disable that extension, banner with "Details / Re-enable" |
| `BROWSER_BLOCKED` | Show denylist/allowlist reason and the domain that was blocked |
Every error surfaces: short message, collapsible technical detail, one primary action, optional "Copy diagnostics" (redacted bundle).

## 4. PHASE 1 — CURSOR & VS CODE-GRADE MOBILE WORKBENCH (UI/UX)

### 4.1 Responsive shell & breakpoints
Breakpoints: **compact** `< 600 dp` (phone portrait) · **medium** `600–839 dp` (phone landscape / small tablet) · **expanded** `≥ 840 dp` (tablet / desktop-width window). The shell renders a **different navigation topology** per breakpoint — not merely resized components:
- **compact:** single-pane stack + swipe-in drawer (left) + Agent HUD as a bottom sheet; tab bar collapses to a scrollable chip row with an overflow tray.
- **medium:** two panes (editor + one secondary pane: explorer / agent / terminal); the drawer becomes a persistent 56 px icon rail; the HUD becomes a right-hand 40 %-width panel showing the same snap-point content.
- **expanded:** three panes (rail + sidebar + editor) with an optional right pane for agent/artifacts; split editor enabled; expandable minimap; Agents Space renders a multi-column session grid; long-press replaces hover tooltips.

Persist layout per breakpoint (`layoutByBreakpoint` in Zustand persist). Rotation must preserve editor scroll/selection and HUD state (host keeps view state; JS remounts only containers). Transitions between topologies animate on the UI thread in ≤ 240 ms.

### 4.2 Navigation rail & side-bar views
Rail icons (user-reorderable via long-press drag): **Explorer, Search, Source Control, Agents, Extensions, Terminal/Console, Settings**. Badges: SCM change count, pending agent approvals, extension updates. Views are registered as **View Containers** (§11.2) so extensions can contribute their own.

**Explorer:** nested tree with lazy per-directory expansion; pull-to-refresh re-syncs external changes; file-type icons; git status decorations (`M/A/D/U/R` with colors **and** accessible labels "modified/added/deleted/untracked/renamed"); long-press context sheet (Rename, Duplicate, Delete, Move, New File, New Folder, Open in Agent Context, Copy Path, Copy Relative Path, Reveal in Files app, Add to Exclusions, Share/Export); multi-select mode with drag-to-move; filter box; empty state offering New File / Import Folder / Clone Repository.
Per-directory lazy loading uses `readDirectory` streaming and caches entries in SQLite with mtime validation; directories > 2 000 entries paginate.

**Search:** query box + include/exclude glob chips; regex / case / whole-word toggles; results grouped by file with 2 lines of context per match; tap-to-jump with match highlight and in-file next/prev; **replace-all** guarded by a diff-summary confirmation sheet (files, changed lines, hunks, with "Review" before writing); cancellable with partial results preserved; hard cap 10 000 results with a "refine your query" hint. Regex runs in a worker with a **ReDoS guard**: 1 s budget per file, degrade to literal search, report the degraded mode in the results header.

**Source Control:** staged / unstaged / untracked groups; per-file diff stat chips (`+12 −3`); tap file → diff editor; swipe right → stage/unstage; long-press → Discard / Revert hunk / Stash; commit composer with message history + template support; branch picker (local/remote/search/create); fetch / pull / push with progress and a conflict entry point; ahead/behind counters; per-repo auth state and "offline queue" indicator for pending pushes.

**Console/Debug view:** extension-host output channels, language-server logs, **agent tool-call trace** (expandable rows with args/result previews), redacted provider network log, crash reports, and a "Copy diagnostics bundle" action.

**Agents view:** see §9.4 (Agents Space) and §10 (Artifact inbox) — this rail item shows a badge for sessions needing review.

### 4.3 Main viewport: header, tabs, editor, status bar
**Header / breadcrumbs bar:** tappable breadcrumb path (`src › components › Editor.tsx`) opening a fuzzy picker scoped to that level; **symbol picker** (functions/classes/methods from the active language tier, fuzzy filter, jump with a brief flash highlight); **layout toggle** (Editor / Split / Preview — Preview renders Markdown, HTML, SVG, JSON, and image formats); overflow kebab menu (Close Others, Close All, Toggle Minimap, Toggle Word Wrap, Format Document, Change Language Mode, Encoding, Line Ending, Save As…, Share, Copy Path).

**Tab bar** (horizontal `FlashList`): drag-to-reorder with haptic snap and edge autoscroll; dirty indicator (`•`) plus save affordance; close (`×`) with an **undo snackbar** ("Closed Editor.tsx — Undo", 5 s); overflow `+` listing all open tabs (VS Code ⌘⇧A parity) with fuzzy filter; pinned tabs; preview tabs (italic, replaced in place); long-press tab → Close Others / Close All / Pin / Copy Path / Reveal in Explorer / Move to Split; hardware-keyboard tab switching (⌥⌘→ / ⌥⌘←).

**Editor surface:** §5. **Minimap:** a 24 px scroll-position indicator with error-density marks on compact; tap to expand into a full read-only minimap on expanded breakpoints; long-press toggles persistence of that choice. **Inline diagnostics:** squiggle + gutter dot; tapping a squiggle opens a diagnostic card (message, source, code, quick fixes, "Ask agent to fix" action).

**Status bar (bottom):** sits above the OS keyboard (lifted by the keyboard rect, never overlapped) and shows:
`⑂ main` · `⟳ 2↓ 1↑` sync/queue · `● GPT-4o (OpenAI)` model pill · `TS ●` language-tier status · `Ln 12, Col 45` · `Spaces: 2 · UTF-8 · LF` · `▮ Online | Offline | Local-only`.
Every segment: tap → related panel/settings; long-press → quick actions (model pill → model switcher; indent → indent pickers; branch → branch picker; network → offline-mode toggle + data-usage summary). Under width pressure segments hide by priority and collapse into a `⋯` segment that opens a detail sheet. Optional second row (user-toggleable) for the agent status line: current task, tool in use, elapsed time, Stop button.

### 4.4 Agent HUD (Antigravity side-panel parity, thumb-first)
Bottom sheet with **4 snap points**: `collapsed` (44 px bar: mode chip, model chip, latest status), `context-bar` (input + context pills + quick actions), `half` (conversation + tool cards), `full` (conversation + task groups + artifacts, with an internal scroll region and a pinned toolbar). On medium/expanded it becomes a right-hand split pane rendering identical content.
Triggers: FAB bottom-right, swipe up from the status bar, right-edge swipe, or `/` in an empty prompt box. Contents:
- **Mode selector:** `Ask` · `Plan` · `Agent` · `Goal` (semantics in §9.2), each with a one-line explanation on first use.
- **Model picker:** grouped by provider; shows context window, cost tier, reasoning badge, latency history; respects fallback routing (§8.2); a "pin model for this session" toggle.
- **Context pills:** selected code range (`L12–L45 in App.tsx`), whole file, explorer selection, terminal output range, current diff, artifact, image attachment (camera/library), docs URL, MCP resource. Pills are removable chips with live token estimates and an aggregate budget meter; if over budget, show a summarize-and-drop preview before sending (never silently truncate).
- **Conversation:** streaming markdown with syntax-highlighted code blocks (Copy / Insert at caret / Apply as diff), tool-call cards (tool name, summarized args, status, duration, one-line "why"), diff cards with Apply / Reject and hunk-level control, artifact cards that deep-link into the Review sheet (§10.2), error cards with Retry, and image thumbnails from the browser tool.
- **Action bar:** Stop, Retry, Regenerate with a different model, Fork conversation, Open in Agents Space, Export transcript, Clear.
- **Resume semantics:** if the app backgrounds mid-run, the session enters `paused` with a visible "will resume when you return" state and continues from the last completed tool call. Side-effecting tools (write, commit, push, browser actuation) are **never** re-executed blindly on resume — they are re-validated against the checkpoint state first (§9.10).

## 4. PHASE 1 (CONTINUED) — COMMAND PALETTE & TOUCH EDITING LAYER

### 4.5 Command palette (Phase 1.2, expanded)
Trigger: top search button, two-finger double-tap in the editor, hardware `⌘K` (files) / `⌘⇧P` (commands) / `⌃⇧P` (Windows keyboards). Both paths covered by Maestro.
- **Modes:** default = Quick Open (files); `>` commands; `@` symbols in active file; `#` symbols in workspace; `:` line number; `/` agent slash commands; `*` open tabs; `!` recent files; `~` settings. Mode chips are tappable so nobody must memorize prefixes.
- **Ranking:** recent + frequency weighted, fuzzy score with path-segment bonus, ≤ 50 ms for 10 000 files using a WASM fuzzy matcher on a prebuilt index (built by the Index Worker).
- **Commands (minimum set):** Format Document, Change Language Mode, Toggle Theme (light/dark/system), Toggle Word Wrap, Toggle Minimap, Go to Symbol, Go to Line, Go to Definition, Find in File, Find in Files, Replace All, Close All Tabs, Close Others, Split Editor, Toggle Split Direction, Save, Save All, Revert File, Git: Commit / Push / Pull / Create Branch / Switch Branch / Stash / Discard Changes, Agent: New Conversation / New Task Group / Switch Mode / Switch Model / Review Changes / Show Artifacts / Stop Agent / Toggle Browser Tool, Terminal: New Session / Select Target, Extensions: Install from VSIX / Reload Extension Host / Disable Extension, Settings: Open Settings JSON / Open Keybindings / Add API Key / Test Connection, Diagnostics: Copy Diagnostics / Export Logs, Offline: Toggle Offline Mode.
- **Execution model:** every palette entry is a registered **Command** in the `CommandRegistry` with `{ id, title, category, when?, icon?, run(), source: 'builtin'|'extension'|'agent' }`; extensions contribute commands through the same registry (this is the single command surface used by UI, palette, keybindings, hardware shortcuts, and the agent's `run_command` tool).
- **When clauses:** a boolean expression mini-language (`editorFocus && !inDebug && resourceLangId == typescript`) evaluated by a small parser with unit tests; used for menus, keybindings, and palette visibility.
- Keyboard: ↑/↓ navigate, Enter run, Tab complete, Esc dismiss, ⌘Enter run-in-background; long-press a row for "Run with arguments" / "Assign shortcut".

### 4.6 Touch editing layer (Phase 1.3 — the core differentiator)
**Cursor Control Wheel:** a draggable floating handle anchored above the caret that never sits under the finger. Drag = move cursor by character; drag with vertical offset = move by word; long-press = switch mode (char / word / line / block); two-finger drag = accelerate. Includes a live coordinate readout (`Ln 12, Col 45`) and haptic tick per character. Auto-hides after 2 s of inactivity; re-anchors when the caret moves or the keyboard appears. Must work while the OS magnifier is disabled (loupe is ours).

**Precision selection & loupe:** custom magnifier loupe (SVG + Reanimated) rendering the line under the finger at 1.6×, with selection drag handles whose hit area is 44 dp but whose visual is 16 dp. Gestures: double-tap = word, triple-tap = line (expands to whole line incl. newline), quad-tap = enclosing block (bracket-aware via the language tier), two-finger tap inside selection = extend to matching bracket, long-press empty area = select-all-in-view.

**Keyboard Companion Toolbar** (docked directly above the OS keyboard; scrolls with it; fully user-reorderable; optional "compact" mode that shows one row + expansion drawer):
- **Row 1 — symbol rail:** Tab, Esc, `{`, `}`, `(`, `)`, `[`, `]`, `<`, `>`, `=`, `;`, `:`, `"`, `'`, `` ` ``, `|`, `&`, `$`, `#`, `/`, `\`, `_`, `-`, `+`, `*`, `%`, `@`, `!`, `?`, `,`, `.` — horizontally scrollable, long-press for variants (e.g. `{` → `{{`, `#{}`; `"` → `"""`; `<` → `<%=`). Insertion uses the host's `insertText` API so undo/auto-pairs behave correctly.
- **Row 2 — editor actions:** Undo, Redo, Save, Find in file, Comment toggle, Auto-indent/reformat selection, Multi-cursor add, Cursor history ◀ ▶, Ghost-text accept (Tab-completion), Snippet expand, Emmet expand, Move line up/down, Duplicate line, Delete line, Toggle preview.
- **Behaviour rules:** long-press Tab inserts the configured indent unit; double-tap Shift = caps-lock indicator passthrough; toolbar hides automatically when a hardware keyboard is connected (unless forced); ghost-text accept chip appears in place of the Tab key while a completion is pending, showing `Tab ⇥` + confidence.

**Multi-cursor on mobile:** tap-and-hold adds a secondary caret aligned to the same column on the next line; vertical two-finger drag adds a column of carets; multi-cursor count chip in the toolbar with "Remove all". **Cursor history:** back/forward jumps through the last 100 caret positions (per file + cross-file), with a mini stack viewer on long-press.

**Gesture vocabulary** (documented + discoverable in 3-screen onboarding, and in Settings → Gestures with a live practice canvas):
| Gesture | Action |
|---|---|
| Two-finger swipe ←/→ | Undo / Redo |
| Two-finger tap | Toggle comment |
| Two-finger scroll in editor | Scroll without moving caret |
| Right-edge swipe ← | Open Agent HUD |
| Left-edge swipe → | Open side bar view |
| Three-finger tap | Command palette |
| Three-finger swipe ↓ | Close keyboard |
| Pinch in editor | Font size (transient; long-press status bar to persist) |
| Pinch on tab bar | Collapse/expand tab chip density |
| Shake | Disabled by default (false positives) — enabled only if the user opts in, mapped to Undo |
| Long-press in gutter | Line actions (Select line, Add breakpoint marker, Copy line, Cut line) |
Conflict rules: gestures are registered in a single resolver with priority (sheet drag > scroll > selection > global), and every global gesture can be disabled individually. All gestures must be verifiable in Maestro flows.

### 4.7 Snippets, Emmet, smart paste, ghost text, Vim
- **Snippets:** VS Code-compatible `.code-snippets` + language-scoped snippets, with `$1`/`${2:placeholder}`/`$TM_FILENAME` variables; triggered by toolbar "expand", a snippet picker sheet, or typing the prefix + Tab. User snippets live in `.mayank-ide/snippets/*.code-snippets` (editable JSON, validated with a schema).
- **Emmet:** abbreviation expansion in HTML/JSX/CSS (`div.card>p*3`, `ul>li.item$*5`, `m10` → `margin: 10px`); expansion preview before insert when the abbreviation is ambiguous; toolbar button + Tab trigger; implemented as a worker-based Emmet engine (host inserts text so undo works).
- **Smart paste & auto-pairs:** bracket/quote auto-close with typed-over, wrapping a selection in a typed delimiter, smart indentation continuation on Enter, auto-indent on paste, "paste as…" sheet (plain text, indented, escaped, base64, URL-decoded). Paste of ≥ 30 lines shows "Pasted 120 lines — Undo" snackbar.
- **Tab completion (Antigravity parity, mobile-shaped):** inline ghost text from the configured completion model (local heuristic provider when offline, provider API when online and enabled). Accept via the toolbar Tab chip (the Tab key visually becomes the accept key while a suggestion is pending), swipe-right on the chip to accept a **partial** suggestion (word-by-word), swipe-down to dismiss. Never blocks typing; suggestions are cancelled on any manual input that invalidates them (100 ms debounce budget, cancellation via `AbortController`).
- **Vim editor mode (opt-in, setting `mayank-ide.editor.vimMode`):** CM6 vim keymap with leader key, `:w`/`:q`/`:wq`/`:e` commands, visual mode, registers, macros; a compact mode indicator in the status bar (`-- NORMAL --`); hardware keyboard strongly recommended, with an on-screen hint when no external keyboard is detected. Vim mode must never trap the user — a persistent "Exit Vim" affordance exists in the toolbar.

### 4.8 Micro-interactions, haptics & motion design (Phase 1.4, expanded)
- **Haptic tiers** (`expo-haptics`): `light` = tab/view switch, chip select, key tap; `medium` = file open, tool approval, stage/unstage; `success`/`warning` = connection test pass/fail, commit success, conflict detected; `heavy` = destructive confirmation (discard, delete, revert). Every haptic is individually disableable in Settings → Accessibility.
- **Motion:** all sheet / drawer / diff / palette animations on the UI thread (Reanimated worklets), 200–320 ms, standard easing (`easeOutQuint` for enter, `easeInOutCubic` for move, spring with `damping 22` for snap points). Nothing animates off-screen content; lists use `FlashList` with `estimatedItemSize` and `removeClippedSubviews`.
- **Reduced motion:** honor `AccessibilityInfo.isReduceMotionEnabled` (and the OS setting change listener) by swapping motion for opacity fades ≤ 120 ms. Never remove a state change entirely — always keep a visible cue.
- **Skeletons, never blanks:** project indexing, marketplace lists, model discovery, git status all render skeletons with progress text ("Indexing 1 240 / 3 800 files").
- **Optimistic UI:** stage/unstage, tab close, pill add/remove, star/pin, artifact read-state apply instantly and reconcile on failure with an undo affordance.
- **Loading states are honest:** no spinner without (a) elapsed time, (b) a cancel affordance when cancellable, (c) a fail path with a reason.

### 4.9 Performance & battery budgets (Phase 1.5, expanded — enforced in CI, see §13.5)
| Metric | Budget | Measurement |
|---|---|---|
| Cold start → editable editor | < 2.5 s (Tier A device) | Instrumented `PERF_COLD_START` mark, Maestro flow, CI report |
| Warm resume (from background) | < 700 ms to interactive | Same |
| Keystroke → glyph latency | < 16 ms @ 60 fps with a 5 000-line file | Host-side frame timing counters streamed to JS; dev HUD overlay |
| Scroll | Always gesture-native, never JS-driven; 0 dropped frames while flinging | Profiler + `PERF_SCROLL_JANK` metric |
| Minimap/decoration update | < 4 ms per keystroke | Dev HUD |
| Memory (idle, 5 tabs open) | RSS < 250 MB (Tier A) | Android Studio profiler / Xcode Instruments, recorded per release |
| Memory growth after 30 min editing | < 10 % growth | Soak test in CI (nightly) |
| JS thread stalls | 0 stalls > 50 ms during typing | `PERF_JS_STALL` counter |
| Battery | No timers while backgrounded; agent streaming suspended; document any unavoidable foreground service in the PR | Battery Historian |
| Data usage | Agent payloads summarized, image attachments user-confirmed, metered-network warning above 5 MB/session | Session summary in Agents Space |
| Indexing | Incremental, chunked (≤ 8 ms per chunk), paused when backgrounded/hot, resumable | Index Worker metrics |
Enforcement: a `scripts/verify-budgets.ts` job parses the CI perf report and **fails the PR** if a budget regresses by > 10 % without an approved ADR exception.

## 5. EDITOR CORE (CodeMirror 6 in the Editor Host)

### 5.1 Engine decision (ADR-002)
**Primary: CodeMirror 6 in a single long-lived WebView.** Reasons: Lezer incremental parsing is fast on mobile CPUs; CM6's input handling is proven on touch devices; the extension API is programmable from a bridge; bundle is ~10× smaller than Monaco; no Monaco worker sprawl. **Monaco compatibility mode** is optional future work behind the same bridge contract for projects needing Monaco-only extensions — it must not be built in v2.x unless a customer requirement forces an ADR.
The WebView loads **local bundled assets only** (`file://` from app bundle) with `allowFileAccess=false`, `allowUniversalAccessFromFileURLs=false`, `originWhitelist` restricted, and **no network access** from the editor host. `javaScriptEnabled` is required (it is our runtime); therefore the host never receives untrusted HTML.

### 5.2 Editor Host bridge API (minimum surface)
```ts
// JS → Host (req)
'doc.open'        { uri, text?, readOnly?, languageId, eol, encoding, scrollTop?, selection? } → { docId, version }
'doc.applyEdits'  { docId, edits: TextEdit[], origin: 'user'|'agent'|'extension'|'format' } → { version }
'doc.setText'     { docId, text, origin }                       // used for reload-from-disk
'doc.save'        { docId } → { text, eol, encoding, version }  // host returns canonical text
'view.setLanguage'{ docId, languageId }
'view.focus' | 'view.scrollTo' { docId, line, column, behavior }
'view.setDecorations' { docId, layer: 'diagnostics'|'git'|'agent'|'search'|'review', decorations: Decoration[] }
'view.setOptions'{ fontSize, lineHeight, tabSize, insertSpaces, wordWrap, lineNumbers, minimap, vimMode, readOnly }
'edit.insertText' { docId, text, cursorMode: 'preserve'|'afterInsert' }   // toolbar keys, snippets, Emmet
'edit.applySnippet'{ docId, snippet, variables }                 // tabstop navigation
'edit.comment' | 'edit.indent' | 'edit.duplicateLine' | 'edit.moveLine' { docId, dir }
'edit.multiCursor' { docId, action: 'addBelow'|'addAbove'|'columnSelect'|'removeAll' }
'cursor.history'  { docId, action: 'back'|'forward' }
'edit.format'     { docId, range?, formatter: 'prettier'|'language' } → { edits }
'diff.open'       { base, modified, mode: 'inline'|'unified'|'split', languageId, reviewMode } → { reviewId }
'diff.review'     { reviewId, decisions: HunkDecision[] } → { appliedEdits }
'search.highlight'{ docId, matches, activeIndex }
'perf.marks'      { … }                                          // host → JS metrics
// Host → JS (evt)
'doc.changed'  { docId, version, edits, origin, isDirty }
'view.changed' { docId, selection, visibleRanges, cursorLine, cursorColumn }
'diagnostics.forDoc' { docId, diagnostics }                      // host-side parse errors only
'edit.undoStack' { docId, canUndo, canRedo }
'perf.report'  { inputLatencyMs, frameDrops, parseMs }
```
Contract rules: every method has a Jest contract test with fixtures shared by host and client; `version` is monotonic per doc; the JS side is the **only** writer to disk; decorations are declarative (host diffs them); the host never decides policy (permissions, save targets, agent behaviour).

### 5.3 Editor feature set (Phase 1.1 "Editor Core" expanded)
Line numbers (relative-number option), active-line highlight, bracket matching + rainbow brackets (toggle), indent guides, folding (language tier + `//#region` markers) with a fold gutter, code tinting via semantic tokens (§5.4), inline error squiggles + gutter dots, inline git blame on long-press of the gutter (per-line, from the git tier), **ghost-text completion layer**, in-file find/replace bar (draggable, never under the keyboard), sticky scroll header (function/class context) on medium/expanded, and a **read-only safe mode** for large/binary files: files > 5 MB open in a windowed viewer with a clear "large file — editing disabled" banner and an explicit "Open anyway (may be slow)" action.
**Huge-file handling:** > 10 k lines → disable minimap and fold-all by default, enable `viewportMargin` windowing, defer semantic tokens to the visible range ±200 lines, and show a status-bar note ("Large file: reduced features").
**Diff/review editor** (shared with SCM and agent diffs): inline red/green gutters, unified + split modes, hunk headers with per-hunk accept/reject/accept-both, word-level intra-line highlighting, "ignore whitespace" toggle, navigation between hunks (toolbar + swipe), and a sticky hunk counter ("Hunk 3 of 9"). Review state (accept/reject per hunk) is a first-class, testable data structure (`DiffApplyPlan`, §16) used identically by the agent's `apply_edits` tool and the SCM diff view.

### 5.4 Language intelligence tiers (be realistic, then be excellent)
| Tier | What it provides | How it runs | Languages |
|---|---|---|---|
| **A — Built-in** | Completion, hover, signature help, diagnostics, formatting, symbols, go-to-def in file | JS/TS via `typescript` compiler + `@typescript/vfs` in a Worker with a project FS shim; others via dedicated worker services (json/css/html/markdown/yaml/sql/shell) | TS, JS, JSX, TSX, JSON/JSONC, CSS/SCSS/LESS, HTML, Markdown, YAML, SQL, Shell, XML |
| **B — Remote LSP** | Full LSP 3.17 over WebSocket to a user-controlled target (dev machine, container, cloud workspace) | `LspClient` over `ws`/`wss` with token auth, TLS pinning optional, per-workspace config in `.mayank-ide/remote.json` | Any language the user hosts (Python, Go, Rust, Java, C#…) |
| **C — Index fallback** | Cross-file symbols, references-ish, outline, fuzzy jumps | tree-sitter WASM + SQLite symbol index in the Index Worker | All supported grammars |
Capability detection drives the UI: a language chip in the status bar shows `A (built-in)`, `B (remote: <target>)`, or `C (index only)`, and every language feature degrades to the next tier with a single tap-to-explain card. **No feature may silently do nothing** — "not available in this tier" is always shown.

### 5.5 Mobile-shaped completion, hover & navigation UX
- **Inline suggestion:** ghost text with a 100 ms debounce, cancelled on invalidation, never stealing the keyboard focus; accepted via the toolbar Tab chip, hardware Tab, or right-swipe on the chip (word-by-word).
- **Completion sheet:** when inline is ambiguous (>= 2 equally scored candidates), show a compact bottom sheet above the keyboard with 5–8 ranked items, kind icons (method/property/local/type/snippet), documentation preview (tap to expand), and type-to-filter that keeps typing inside the editor (the sheet is a *view*, never a modal text field).
- **Hover → long-press:** hover information appears on long-press of a symbol (documentation card with types, signature, quick actions: Go to Definition, Find References, Copy Type, Ask agent about this).
- **Navigation history:** `⌃-`/`⌃⇧-` equivalents via toolbar buttons and palette commands; a mini "back stack" sheet listing symbol jumps with file:line previews.
- **Refactors (Tier A, minimum set):** Rename Symbol (in-file), Extract to const/function/variable, Convert to arrow function/async, Organize imports, Add missing import, Sort imports, Wrap in try/catch, Toggle quotes. Each refactor returns edits applied through `doc.applyEdits` with `origin: 'extension'` so it is a single undo step; each has unit tests over fixture files.
- **Formatter:** Prettier in a worker (bundled, pinned) with per-language config read from `.prettierrc*`, `editor.formatOnSave` (default off on mobile — it can surprise users; on by default for JSON), range formatting for selections, and an "unsupported file" message rather than silent no-op.
- **Diagnostics pipeline:** host parse errors (instant) + language tier diagnostics (debounced 400 ms, per-doc cancellation), deduplicated by `(code, range, source)`, capped at 200 per file (overflow shown as "+N more"), sorted by severity then position, mirrored to: squiggles, gutter dots, scroll-lens marks in the minimap, the Problems sheet (grouped by file, filter by severity, tap to jump), and the status bar error/warning counters with tap → Problems sheet.

## 6. PHASE 3 — FILES SYSTEM, PROJECTS, SEARCH & SOURCE CONTROL

### 6.1 Virtual File System (VFS) & project model
```ts
interface FsProvider {
  id: string;                                  // 'local-saf' | 'icloud' | 'app-sandbox' | 'sftp' | 'github' | 'zip'
  capabilities: { write: boolean; watch: boolean; rename: boolean; permissions: boolean; ranged: boolean };
  stat(path: string): Promise<FileStat>;
  readDirectory(path: string): Promise<DirEntry[]>;
  readFile(path: string, opts?: { encoding?: 'utf8' | 'binary' }): Promise<Uint8Array | string>;
  writeFile(path: string, data: Uint8Array | string, opts?: { expectedMtime?: number }): Promise<void>;
  mkdir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  delete(path: string, opts?: { recursive?: boolean }): Promise<void>;
  watch?(path: string, cb: (events: FsEvent[]) => void): Disposable;
}
```
- **URI scheme:** all paths are `provider://<root-id>/<relative/path>` internally, normalized to POSIX separators with a per-provider `toDisplayPath`/`fromDisplayPath`. A single `normalizePath` module (with unit tests incl. Windows separators, unicode normalization NFC/NFD — critical on iOS, and case-sensitivity flags per provider) is the **only** place path juggling happens.
- **Providers:** app sandbox (`expo-file-system` documents dir — the default for new projects), Android SAF folder (persistable permissions stored by URI), iOS Files/iCloud (security-scoped bookmarks, refreshed on launch), SFTP/SSH remote workspace, GitHub/GitLab repo-backed read/write via API (fetch → sparse checkout locally, commit via API or via local git), ZIP import/export.
- **Write safety:** atomic writes (temp + rename) where the provider allows; `expectedMtime` optimistic-concurrency check; a conflict state that prompts "File changed on disk — Reload / Overwrite / Show diff" and never silently clobbers. External-change detection: provider watch where available, else **re-stat on app focus** and on tab activation (no polling timers).
- **Project model:** `Project { id, name, roots: Root[], trust: 'trusted'|'restricted', excludes: string[], languageOverrides, remoteTargets }`. Multiple roots per project (cross-repo context for agents). Workspace session state (open tabs, layout, last cursor) is keyed by project id.
- **Workspace trust:** on first open, a sheet explains what Trust enables (agent file writes, task execution via remote, extension activation, MCP servers) and offers **Restricted mode** (read-only edits to disk, no agent writes, no extension activation, no MCP). Restricted mode is clearly indicated in the status bar and can be upgraded per project later.
- **Conventions:** `.mayank-ide/` inside the project root (git-ignorable) stores `settings.json`, `keybindings.json`, `snippets/`, `artifacts/`, `checkpoints/`, `remote.json`, `prompts/`, `rules/`, `skills/`, `agents/` (subagent definitions).

### 6.2 Indexing & search (Index Worker)
- **File index:** walk roots (respecting `excludes`, `.gitignore`, `.mayank-ideignore`, hidden files toggle) in chunks ≤ 8 ms; store `path, size, mtime, hash(sha1 of first 4 KB + size), languageId, gitStatus` in SQLite. Incremental: re-hash only files whose mtime/size changed; deletions detected on focus rescan. Never block the UI; progress is visible and cancellable; indexing pauses when backgrounded or thermally throttled.
- **Symbol index:** tree-sitter/Lezer parse per file → `symbols(name, kind, containerName, path, startLine, endLine, signature)`; supports outline, `@`/`#` palette modes, breadcrumb hierarchy, and agent `get_symbols` tool.
- **Text search:** FTS5 over extracted tokens for the offline tier (fast, approximate for substring queries) **and** ripgrep-wasm for exact regex/glob search (authoritative, used by the Search view and the agent's `search_text` tool). Results stream in chunks; the Search view renders via `FlashList` with virtualization and a 10 000-result cap.
- **Semantic code search (`/codesearch` parity):** when the user has an embeddings-capable provider configured (or an Ollama/vLLM endpoint), enable a "Semantic search" toggle. Chunk files (200 lines / 1 200 tokens with 20 % overlap), embed via the provider's embeddings API, store vectors in SQLite (float32 blob) with brute-force cosine search for ≤ 50 k chunks and a coarse IVF index above that. When unavailable, the toggle explains the requirement and stays off — never a silent fallback to keyword search pretending to be semantic.
- **Replace engine:** dry-run produces a plan (per file: hunks + conflict markers where the match moved), shown in the confirmation sheet; execution applies file-by-file with atomic writes, skips files that changed since the scan (reporting them as "skipped — changed on disk"), and is fully undoable via a single `Checkpoint`.

### 6.3 Git adapter (isomorphic-git-based, mobile-honest)
- **Capabilities:** init, clone (fast path + full), fetch, pull (ff-only default; merge with explicit confirmation), commit (staged only, message + description + amend), branch (list/create/switch/delete/rename), remote management, log (paginated, graph view), status (`MATRIX` + per-file `+/-` stats via jsdiff), stage/unstage/hunk-stage, discard (per file/hunk with a checkpoint first), stash push/pop/list, tags (list/create/push), and conflict resolution (ours/theirs/manual with a 3-way view).
- **Known limits (must be surfaced in the UI, not hidden):** no SSH transport (use HTTPS + PAT/device flow), large repos are slow and memory-heavy → **recommended flow:** "Fast clone" downloads a tarball for the default branch, installs it, then `git init` + remote + shallow fetch for incremental work; warn above a configurable repo-size threshold (default 150 MB) with an estimate and a "clone anyway" confirmation.
- **Auth:** HTTPS tokens in keychain keyed by `git:<host>:<user>`; GitHub/GitLab **device-flow OAuth** as the preferred path (no typed passwords, ever); token scopes shown before use; SSH keys are not supported (state it in the UI with a link to the docs section).
- **Offline queue:** commits are local (always allowed); pushes are queued with a visible "2 commits pending push" chip, retried with backoff on reconnect, and never auto-pushed without an explicit user action unless "auto-push when online" is enabled in settings.
- **Diff engine:** jsdiff for line diffs, diff-match-patch for intra-line word diffs; syntax-aware hunk headers (`function foo() {`) via the symbol index; performance target: < 120 ms for a 5 000-line diff, computed in a worker for files > 2 000 lines.
- **Git status decorations** feed the Explorer and the status bar branch segment; the agent's `git` tools are restricted by the permission engine (§9.3b), with `push` and `reset --hard` requiring explicit approval by default (`ask`).

### 6.4 Source control UX (Phase 1.1 "Source Control" expanded)
Changes tree (staged/unstaged/untracked) with bulk actions in a header menu (Stage All, Unstage All, Discard All with a checkpoint, Stash All); commit composer that shows a staged-file summary and enforces a message (with a template + emoji-free conventional-commit helper); **commit & push** as a single action when a remote exists; conflict banner that opens the resolver with "Keep mine / Keep theirs / Open in editor" per conflict; a post-commit "Undo commit (keep changes)" escape hatch; and a History tab (paginated log with per-commit file list, tap → diff, "Revert this commit (creates a new commit)"). Every destructive action creates a checkpoint first (§9.10) so it is always recoverable, and shows the checkpoint name in the confirmation dialog.

## 7. TERMINAL, TASKS, PROBLEM MATCHERS & DEBUG-LITE

### 7.1 Terminal (real, but honest about where the shell lives)
**Targets** (user picks per session; the target is always visible in the terminal header chip):
1. **Remote PTY over SSH** (primary): host/port/user/key-or-password from keychain; `react-native-ssh-sftp` native module or a WASM SSH build; xterm.js in the Terminal Host; full ANSI/256-color/truecolor, resize events, 10 k-line ring buffer, per-session reconnect with a "session ended (exit 0)" card and history preserved.
2. **Cloud/remote dev container** (WebSocket): an endpoint the user supplies or our relay; same protocol as SSH but token-authenticated; supports tmux-style reattach.
3. **Android local shell integration (optional)**: if Termux is installed and the user explicitly enables integration via its intent API, offer it as a target. Requires explicit consent, and must degrade gracefully when absent (feature hidden, not broken).
4. **Built-in command surface**: commands we implement natively and safely under `.mayank-ide/commands/`: `ls`, `cat`, `grep` (delegates to the search engine), `find`, `wc`, `head`, `tail`, `wc`, `touch`, `mkdir`, `rm` (with permission engine), `mv`, `cp`, plus `git:*` mapped to the git adapter, `node -e` explicitly **not** supported, and `npm`/`yarn` only via a remote target (`npm run <script>` is forwarded to the remote PTY with the workspace mirrored or available remotely). Clearly labelled `builtin` so nobody mistakes it for a real shell.
**PTY protocol** (`TerminalBridgeMessage`): `create{target,cols,rows,cwd}`, `data{base64}`, `input{base64}`, `resize{cols,rows}`, `exit{code,signal}`, `title{value}` (shell-integration titles), `cwd{path}`, `error{code,message}`. Backpressure: host ACKs every 64 KB; PTY output pauses if unacked > 512 KB. Reconnection: exponential backoff (1 s → 30 s), resume with `tmux attach` when available, otherwise a new shell with a warning.
**Mobile ergonomics:** session tabs (max 4 visible + overflow sheet), toolbar above the keyboard (Ctrl, Alt, Esc, Tab, ↑↓←→, ~, |, /, -, tmux prefix, keyboard-toggle, copy-mode), pinch-to-zoom font size, long-press → copy/paste/select-all/clear, "Send last command here" from the agent HUD, and a **paste-to-agent** action ("Explain this output" / "Fix this error" → creates a new agent turn with the terminal range as a context pill).

### 7.2 Tasks & problem matchers (VS Code parity, real)
- `tasks.json` v2 supported subset: `label`, `type: 'shell'` (routed to a selected remote/builtin target), `command`, `args`, `options.cwd/env`, `group: {kind: build|test, isDefault}`, `dependsOn`, `dependsOrder: sequence`, `problemMatcher` (string ref or inline pattern), `presentation` (focus/panel/reveal), `runOptions.runOn: default|folderOpen (opt-in)`.
- **Problem matchers:** full single/multi-line pattern support (`file`, `line`, `column`, `severity`, `message`, `code`, `location`, `loop`), `$tsc`, `$eslint-stylish`, `$gcc`, `$msCompile` built-ins, and extension-contributed matchers. Matches populate **Problems** with tap-to-jump and feed the agent a structured list (`problems` context pill).
- **Task runner UX:** "Run Task" sheet grouped by build/test/other with recently used first, live output panel, exit-code card, cancel button, re-run, and "Ask agent to fix failures" (injects the problem list as context).
- **Script discovery:** parse `package.json` scripts, `Makefile` (basic), `justfile`, `pyproject.toml` (tool sections), and `Cargo.toml` to offer runnable tasks without a `tasks.json`; show the discovered source in the sheet so it is never magic.

### 7.3 Debug-lite (declared scope — do not over-promise)
Deliver exactly this, and label it "Debug (lite)" in the UI:
1. **Remote DAP client** over WebSocket to a user-hosted `debugpy`/`node --inspect`-style adapter (breakpoints, stepping, threads, call stack, locals, watches, console) with an on-screen debug toolbar (Continue, Step Over/Into/Out, Restart, Stop) that replaces the status bar while active.
2. **HTTP request debugging**: send requests with headers/body from a request file (`.http`/`.rest` support), view status/headers/body/timing, save as a collection, and inject responses as agent context.
3. **Logpoints & console.log rewriting** (JS/TS only, Tier A): insert a logpoint that prints variables without editing the file permanently; collected output shown in the Debug Console with file:line links. Rollback via checkpoint.
4. **npm/Yarn test runner UI** (remote target): parse vitest/jest/mocha output into a tree of pass/fail with per-test durations and "open test" / "ask agent to fix".
**Explicitly out of scope:** native-language breakpoint debugging on-device, attaching to an on-device app process, memory/CPU profilers.

## 8. PHASE 3 — MULTI-PROVIDER AI: KEYS, ENDPOINTS, ROUTING

### 8.1 Provider adapter contract (the single integration point)
```ts
export type ProviderId = 'openai' | 'anthropic' | 'google' | 'groq' | 'mistral' | 'xai'
  | 'openrouter' | 'together' | 'deepseek' | 'ollama' | 'lmstudio' | 'vllm' | 'custom';

export interface ProviderAdapter {
  id: ProviderId;
  displayName: string;
  authKind: 'api-key' | 'oauth-device' | 'none';
  capabilities: {
    streaming: boolean; tools: boolean; parallelTools: boolean; vision: boolean;
    reasoning: boolean;          // exposes reasoning/thinking output
    embeddings: boolean;         // exposes an embeddings endpoint
    jsonMode: boolean;           // structured output support
    promptCaching: boolean; maxContextTokens: number;
  };
  listModels(ctx: ProviderContext): Promise<ModelInfo[]>;
  complete(ctx: ProviderContext, req: CompletionRequest, signal?: AbortSignal): Promise<CompletionResponse>;
  streamComplete(ctx: ProviderContext, req: CompletionRequest, signal?: AbortSignal): AsyncIterable<StreamChunk>;
  embed?(ctx: ProviderContext, texts: string[], model?: string): Promise<number[][]>;
  testConnection(ctx: ProviderContext): Promise<{ ok: boolean; latencyMs?: number; detail?: string }>;
  countTokens?(model: string, text: string): number | Promise<number>;   // else use the estimator
  normalizeError(err: unknown): ProviderError;                            // maps to §3.5 taxonomy
}

export interface ModelInfo {
  id: string; displayName: string; contextTokens: number;
  supportsTools: boolean; supportsVision: boolean; supportsReasoning: boolean;
  costInPerMTok?: number; costOutPerMTok?: number; deprecated?: boolean;
  tags?: Array<'fast' | 'smart' | 'cheap' | 'local' | 'long-context' | 'code'>;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];                 // role + content parts (text | image | tool-call | tool-result)
  tools?: ToolSchema[];
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
  temperature?: number; topP?: number; maxTokens?: number; stop?: string[];
  responseFormat?: { type: 'json'; schema?: JSONSchema };
  stream?: boolean;
  metadata: { sessionId: string; projectId: string; purpose: 'chat' | 'completion' | 'title' | 'summarize' | 'embed' | 'agent' };
}

export type StreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool-call'; id: string; name: string; argsDelta: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cachedTokens?: number }
  | { type: 'done'; finishReason: 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' }
  | { type: 'error'; error: ProviderError };
```
**Adapters to implement (M6):** OpenAI (Responses + Chat Completions fallback), Anthropic Messages (with tool_use blocks + extended thinking), Google Gemini `generateContent`/`streamGenerateContent` (functionCall parts), Groq (OpenAI-compatible, fast small models), plus **local/self-hosted**: Ollama (`/api/chat`, `/api/embeddings`), LM Studio, vLLM/llama.cpp OpenAI-compatible servers, and a **Custom** adapter where the user maps: base URL, auth header name/prefix, chat path, models path, streaming format (`sse-openai` | `sse-anthropic` | `json-lines`), tool-calling support flag, and JSON path overrides for the response. Also support OpenRouter/Together/DeepSeek/Mistral/xAI via the OpenAI-compatible path once the Custom adapter is proven (each gets a preset, no new code path).
**Hard requirements:** every adapter has (1) recorded-fixture unit tests for streaming, tool calls, error mapping, and cancellation; (2) an AbortSignal-honouring implementation that actually stops the network read; (3) `usage` emission when the provider offers it; (4) no hidden retries beyond the documented policy (max 2 retries on 429/5xx/idle-timeout with jittered backoff, honoring `Retry-After`); (5) SSE parsing that tolerates partial frames, keep-alives, and `data:` multi-line payloads (unit-tested with byte-by-byte chunk splitting, including mid-UTF8 splits).

### 8.2 Model routing, fallback & cost control
**Router rules (user-editable, with sane defaults):**
| Purpose | Default resolution |
|---|---|
| Agent (plan/act) | Required-capable model from the active provider → user's preferred model → best available with `tools: true` |
| Chat/Ask | Same as agent |
| Tab completion | Cheapest fast model tagged `fast`; local Ollama model if configured; otherwise the built-in heuristic provider (no network) |
| Summarize/compact | Cheapest model with ≥ 64 k context; local first |
| Title generation | Cheapest available |
| Embeddings | Provider with `embeddings` capability; local (Ollama) preferred when offline-mode is on |
| Vision (screenshots, browser verify) | Model with `vision: true` |

**Fallback chain:** `primary → secondary (user-ordered list) → local model (if reachable) → hard stop with a clear error`. On a provider failure the model pill animates to a transient `switched to <model> (fallback)` state with a one-tap undo (Phase 3.5 requirement) and a log entry in the session's tool-call trace. Fallback is **never** used for: provider-specific auth errors (re-auth instead), content filters (surface the reason), or when the user pinned a model for that session ("pin model" prevents silent switching and instead queues for retry).

**Cost & context guards (must be visible, not magic):** pre-send token estimate with per-request cost estimate; a session cost meter; a configurable per-session and per-day budget cap that **pauses** the agent and asks for approval rather than silently spending; context-compaction policy (summarize oldest turns, keep the last N tool results verbatim, drop duplicate file reads, keep the active plan + task list) with a "what was dropped" inspection sheet.

### 8.3 Usage ledger & Credits screen
`UsageLedger` rows: `(ts, sessionId, projectId, purpose, provider, model, inputTokens, outputTokens, cachedTokens, estimatedCostUSD, latencyMs, ok|errorCode)`. The **Usage** screen shows: today/7-day/30-day totals, breakdown by provider/model/purpose, cost estimates with a clear "estimate" badge (never presented as a bill), quota indicators for providers that expose them, top sessions by cost, and an export (CSV/JSON). Local models show tokens with $0 and an explicit "local (free)" label.

### 8.4 Settings → Providers (Phase 3.5, expanded into the required UX)
Screen structure: grouped cards, one per provider, each showing **logo, status dot (active key / no key / unreachable / OAuth needed), active model, usage estimate this month**, and a chevron into a detail screen. A "+" card adds a custom/OpenAI-compatible endpoint. Global switches at the top: Offline mode (forces local models only), "Send telemetry of request metadata" (off by default), "Allow image attachments".
**Provider detail screen:**
- **Key entry:** masked field with reveal gated behind a biometric check; paste-from-clipboard auto-detected with **format validation only** (e.g. OpenAI keys start with `sk-`, Anthropic `sk-ant-`, Google `AIza`) showing a green/orange check — **no network validation request until the user taps Test Connection**; a "Where do I get this?" help link per provider.
- **Test Connection:** 5 s timeout, shows latency, resolved model count, and the actual error text on failure (never a generic "failed"); success haptic (`success`), failure haptic (`warning`).
- **Fetch Models:** skeleton dropdown, 5 s timeout, explicit retry, results cached in MMKV keyed by `provider + endpoint URL + key fingerprint`, and a manual "Add model ID" fallback for endpoints that hide their list.
- **Model pinning & defaults:** set default model per purpose (agent, completion, summarize, embeddings) with capability warnings when a chosen model cannot satisfy the purpose.
- **Custom endpoint builder:** base URL (validated: https required unless `localhost`/RFC1918 with an explicit "insecure local endpoint" acknowledgement), auth header name/prefix, chat path, models path, streaming format, tool-calling support, extra headers (JSON), and a **live "Try it" panel** that streams a test completion with the raw (redacted) request/response visible for debugging.
- **Removal:** deleting a key requires biometric confirmation, clears caches (model lists, token counts), and leaves a confirmable summary of what will stop working.

## 9. AGENT RUNTIME (Antigravity-class autonomy, mobile-safe)

### 9.1 Session model
```ts
interface AgentSession {
  id: string; projectId: string; title: string;      // auto-titled, renameable
  mode: AgentMode; modelRef: { provider: ProviderId; model: string; pinned: boolean };
  status: 'idle' | 'planning' | 'running' | 'waiting-approval' | 'paused' | 'needs-review'
        | 'completed' | 'failed' | 'cancelled';
  taskGroups: TaskGroup[]; artifacts: ArtifactRef[]; checkpoints: CheckpointRef[];
  contextPills: ContextPill[]; rulesRefs: string[]; skillsRefs: string[]; subagentRefs: string[];
  usage: { inputTokens: number; outputTokens: number; costUSD: number };
  createdAt: number; updatedAt: number; backgroundJobId?: string;
}
type AgentMode = 'ask' | 'plan' | 'agent' | 'goal';
```
Sessions are durable in SQLite, resumable after an app kill or OS-eviction, and listed in **Agents Space** (§9.4). A session binds to a project (its permission scope) and may target multiple roots.

### 9.2 Modes (semantics are contractual)
- **Ask** — read-only. Tools: read/search/symbols/web-read. Never writes, never runs commands. "Explain this" lives here.
- **Plan** — read-only **plus artifact writing**. Produces an *Implementation Plan* artifact (goal, assumptions, file-by-file change list, test plan, risks, open questions) and a *Task List* artifact. **No project mutation whatsoever.** Ends at `waiting-approval`; approving switches the session to `agent` mode carrying the approved plan as the authoritative task list.
- **Agent** — full loop with tools, write access, checkpoints, and the permission engine. Stops at `needs-review` when an artifact requires review. Per-project setting: `always ask` (default) | `ask on destructive only` | `auto-apply safe edits` (writes inside the project root that are non-deleting and ≤ 200 changed lines).
- **Goal** (`/goal` parity) — run to completion without intermediate prompts, still fully subject to the permission engine. Progress surfaces only through Task Groups and artifacts. Pauses for `ask`-gated actions that are not pre-approved, plus budget/quota limits.
- **Grill-me** (`/grill-me` parity) — a flag on Plan that forces a clarification round: the agent asks 3–7 targeted multiple-choice questions and refuses to produce a plan until answered or explicitly waived.
Mode is visible at all times in the HUD's collapsed bar; switching mode mid-session is allowed and logged in the trace.

### 9.3 The agent loop (resumable at every step)
```
1 Context assembly   goal, rules, skills, plan/task state, pills, file slices, search results,
                     diagnostics, terminal output, artifacts, prior tool results
                     → token count vs budget → compaction if needed
2 Model call         streamComplete with tool schemas; reasoning streamed on a separate channel
3 Decision           answer text | tool-calls | plan artifact | task-list update | done
4 Permission         per tool call: engine decision (allow | ask | deny) — see §9.3b
5 Execution          run tool in its sandbox with timeout, cancellation, output truncation
6 Observation        append truncated result (+ "open full result" handle), update task list,
                     append trace entry, snapshot a checkpoint if the tool mutated files
7 Reflection         every N steps (default 6) or after any failure: re-plan, update Task Groups,
                     prune stale context, and record the reason in the trace
8 Termination        goal met | blocked on user input | budget/quota | user stop | 60-step cap
```
**Resumability contract:** after every step 6 the runtime persists `(sessionId, stepIndex, messages, toolResultsRef, pendingApprovals, checkpoints)`. On resume, pending approvals are **re-presented** (never auto-approved), and side-effecting tools that already ran are marked `already-applied` and verified against the checkpoint before any re-execution. Backgrounding never loses a session; on iOS the run pauses at the next step boundary with a visible "paused — will resume" state, and on Android it continues inside a foreground service with a persistent notification (`Agent is running — 3 tasks left · Stop`).

### 9.3b Permission engine (Antigravity parity, ported to mobile)
Evaluation order: **deny → ask → allow**, then engine defaults. Matching supports exact targets, directory prefixes, wildcards (`*` = any target in that action namespace, `dir/**` = subtree), and a `regex:` prefix for commands and paths. Implicit rules are enforced: **allow write implies allow read** on the same target; **deny read implies deny write**; denying a directory denies its descendants.
```ts
type PermAction = 'read_file' | 'write_file' | 'delete_file' | 'read_url' | 'execute_url'
  | 'command' | 'mcp' | 'extension' | 'clipboard' | 'share_external' | 'biometric'
  | 'network_domain' | 'agent_tool';
interface PermissionRule {
  action: PermAction; target: string;
  decision: 'allow' | 'ask' | 'deny';
  scope: 'session' | 'project' | 'global';
  note?: string;                 // shown in the prompt card for transparency
}
```
Paths are normalized before matching: Android SAF `content://` URIs ↔ normalized POSIX-ish paths, iOS security-scoped bookmark paths, backslash inputs, NFC/NFD unicode, and per-provider case sensitivity — all handled in one `normalizeTarget()` module with property-based tests (`fast-check`).
**Defaults (secure by default):** project-root file read/write = `allow`; paths outside the project = `ask`; every shell command = `ask` (exact-match fallback when a command cannot be tokenized safely; `regex:` available for power users); `read_url` / `execute_url` = `ask`; MCP tools = `ask` unless the user marks that server trusted; extension file writes = `ask`; agent-initiated clipboard access = `ask`; destructive git (`push`, `reset --hard`, `clean -f`, force ops) = `ask` **and requires a checkpoint first**; anything unconfigured = `ask` (never implicitly allow).

**Interactive prompt card (mobile-shaped):** plain-language summary ("Agent wants to **write** `src/api/client.ts`"), the exact target, the rule that triggered the prompt, and the actions **Allow once · Allow for session · Always allow (scope) · Deny · Edit scope**. "Edit scope" opens a chip editor where the target can be widened or narrowed (`/src/api/client.ts` → `/src/api/`), validated so the edited scope still covers the request; the expanded grant is remembered for the chosen scope and suppresses repeat prompts for the rest of the turn (parity behaviour). A **Deny** returns a structured `TOOL_DENIED_BY_POLICY` observation to the model so it can adapt — never a silent failure, never a crash. Bulk prompts are coalesced into one card ("4 file writes in /src/api — review once") with an expandable list.

**Audit log:** every decision (auto-allowed included) is recorded in SQLite: `(ts, sessionId, action, target, decision, ruleMatched|default, userResponse, durationMs)`. Viewable in Settings → Security → Agent activity; exportable as JSON; contains **no** file contents and **no** secrets. A "recently denied" view offers one-tap rule creation so users learn the system without reading docs.

### 9.4 Agents Space (Agent Manager parity)
A dedicated full-screen surface (rail item **Agents**, palette command "Open Agents Space", tablet: multi-column grid) that answers three questions instantly: *what is running, what needs me, what did they cost?*
- **Filters:** project, status (`running`, `waiting-approval`, `needs-review`, `paused`, `completed`, `failed`), mode, model, date range.
- **Session card:** title, project chip, mode + model chips, elapsed time, current task line ("Running `search_text` — 3/7 tasks"), progress bar from Task Groups, cost estimate, artifact count with unread badge, quick actions (Open, Stop, Resume, Fork, Rename, Archive, Delete conversation with confirmation).
- **Safety:** starting a second agent on the same project warns about concurrent write conflicts (file-level locking: `AgentLock` service grants advisory locks per file; a blocked write returns a structured "file locked by session X" observation). Two agents may run in parallel on disjoint roots without warning.
- **Cross-project view:** supported and expected — the card grid groups by project with collapsible headers; a top bar shows aggregate running count, total pending approvals, and today's estimated spend.
- **Home-screen affordances:** app badge = sessions needing review; a lock-screen/notification center entry per approval request ("Mayank IDE: agent wants to run `npm test` — Review").

### 9.5 Task Groups (Antigravity parity)
Every agent turn creates a **Task Group** containing ordered `AgentTask`s:
```ts
interface AgentTask {
  id: string; title: string;                          // imperative: "Add retry to API client"
  status: 'todo' | 'in-progress' | 'blocked' | 'done' | 'failed' | 'skipped';
  detail?: string;                                    // one-line rationale or blocker
  artifacts: ArtifactRef[]; toolCalls: number; startedAt?: number; endedAt?: number;
  filesTouched: string[]; dependsOn?: string[];
}
interface TaskGroup { id: string; sessionId: string; label: string; tasks: AgentTask[];
  status: 'todo'|'in-progress'|'done'|'failed'|'partial'; createdAt: number; summary?: string; }
```
Rendering: collapsible timeline in the HUD and in the session detail screen; live status per task; tap a task → the tool calls, artifacts, and diffs that belong to it; a group summary appears when it completes ("Done: 4 tasks, 3 files changed, 2 tests added — Review changes"). Users can **add, edit, reorder, split, or delete tasks**, and the agent must treat the user-edited list as authoritative (re-planning must preserve user edits and mention any conflict). The group is the unit the plan-approval gate operates on: approving a plan approves its task groups, after which mode flips to `agent`.

### 9.7 Slash commands (parity set + mobile additions)
| Command | Behaviour |
|---|---|
| `/goal <text>` | Enter Goal mode and run until done (permission-gated) |
| `/grill-me` | Ask clarifying questions before planning |
| `/plan` | Produce/refresh an Implementation Plan artifact |
| `/agents` | Open Agents Space (or list sessions inline) |
| `/codesearch <query>` | Semantic/structural code search across roots |
| `/diff` | Open Review Changes for the session |
| `/permissions` | Open the rule editor for the current project |
| `/resume [id]` | Resume a paused/interrupted session |
| `/statusline` | Configure the agent status line contents |
| `/title <text>` | Set the session title (window-title parity) |
| `/usage` | Session + provider usage and cost breakdown |
| `/voice` | Dictate the next prompt (voice dictation with on-device speech-to-text where available, cloud with a clear consent gate otherwise) |
| `/browser <url\|task>` | Start a browser-tool turn against a URL or a dev-server route |
| `/schedule <when> <task>` | Schedule a one-time or recurring task (mobile limits: exact scheduling is best-effort; the agent runs when the OS grants a background window, and a notification offers "run now") |
| `/checkpoint [label]` | Create a checkpoint |
| `/revert [checkpoint\|last]` | Revert with a confirmation sheet |
| `/offline on\|offline off` | Force local-models-only mode |
| `/budget <amount\|off>` | Set a session or daily spend cap |
| `/attach` | Open the attachment picker (files, images, artifacts, URLs) |
Every slash command is a registered command (§4.5), so it is discoverable in the palette, bindable to a key, and callable by the agent's own tool surface where safe.

### 9.8 Tool registry (the agent's capabilities)
```ts
export interface AgentTool<A = unknown, R = unknown> {
  name: string;                       // stable snake_case id exposed to the model
  title: string;                      // human label in the trace/UI
  permAction: PermAction;             // permission namespace (§9.3b) — mandatory
  description: string;                // written for models: when to use, when NOT to use
  params: JSONSchema;                 // strict, validated before execution
  destructive: boolean;               // triggers a checkpoint + stronger confirmation copy
  requiresOnline?: boolean;           // hidden when offline mode is on
  requiresTrust?: boolean;            // hidden in restricted mode (filtering is logged)
  maxResultBytes: number;             // truncation budget with a blob handle for the overflow
  targetOf(a: A): string;             // target string used by the permission matcher
  run(a: A, ctx: ToolContext): Promise<R>;   // ctx: { signal, sessionId, project, fs, trace, log }
  summarize?(a: A, r: R): string;            // one-liner for the trace card and the model
}
```
Registry rules: **every tool declares a permission namespace** (no exceptions, including read-only tools); schemas are strict (`additionalProperties: false`); results are truncated with an explicit `truncated: true` plus a blob handle; executions emit trace entries with durations; tools never throw raw errors at the model — they return `{ ok: false, code, message, hint }`; unavailable tools are filtered out of the schema list and the filtering is visible in the trace ("3 tools unavailable in restricted mode").

**Tool catalogue (v1 — implement in this order):**
| Group | Tools |
|---|---|
| Read/understand | `read_file` (range-aware, encoding-aware), `list_dir`, `file_info`, `search_text` (regex/glob, streaming), `search_files` (fuzzy name), `get_symbols` (file or workspace outline), `find_references` (index tier), `read_diagnostics`, `read_git_status`, `read_git_log`, `read_url` (fetch + readability extraction, denylist enforced) |
| Plan/communicate | `create_artifact` (plan, walkthrough, diagram, task-list, note), `update_task_list`, `ask_user` (structured question with options; session pauses), `report_progress` |
| Write/modify | `create_file`, `write_file` (full or patch), `apply_edits` (multi-file `DiffApplyPlan`), `rename_path`, `move_path`, `delete_path` (always `ask` + checkpoint), `format_file`, `run_refactor`, `replace_in_files` (dry-run then apply) |
| Execute | `run_command` (remote PTY or builtin surface; `ask` by default), `run_task` (tasks.json + discovered scripts), `read_terminal_output`, `send_terminal_input`, `run_tests` (structured results) |
| VCS | `git_status`, `git_diff`, `git_stage`, `git_commit`, `git_branch`, `git_push` (`ask` + checkpoint first), `git_stash`, `git_restore_checkpoint` |
| Agentic meta | `spawn_subagent` (bounded, inherits scope, own context), `run_skill`, `todo_write` (working memory), `web_search` (opt-in provider) |
| Extension/MCP | `mcp_call` (policy-gated), `list_mcp_tools`, `extension_command` (only commands marked agent-callable by the extension) |
| Dev/preview | `browser_open`, `browser_snapshot`, `browser_act`, `browser_screenshot`, `browser_console`, `browser_network`, `browser_close` (§10.4) |

### 9.9 Context builder rules
- **Never dump files.** Read tools return ranges with explicit line numbers; whole-file reads > 400 lines require a `reason` argument and are logged.
- **Deduplicate:** identical file ranges already present in context are replaced with a reference ("unchanged since last read") instead of re-sending bytes.
- **Prioritize:** active selection/editor file > open tabs > plan/task list > diagnostics & terminal > search results > repo tree summary.
- **Guard:** secret scrubbing on read (§12.4) — `.env`, `*.pem`, `id_rsa`, `credentials.json`, `.netrc`, and keychain-adjacent patterns return a redacted placeholder plus a "values hidden by policy" warning to the model.
- **Budget:** default agent context budget = `min(modelContext × 0.7, 120 k tokens)` with 8 k tokens reserved for the reply; compaction is logged and inspectable via a "what was dropped" sheet.

### 9.10 Checkpoints, Review Changes & rollback
- **Checkpoint kinds:** `git` (a lightweight ref/commit created by the git adapter when the workspace is a repo — preferred) and `vfs` (a compressed patch set of touched files for non-git workspaces, stored under `.mayank-ide/checkpoints/<id>/`).
- **Creation points:** before any agent write batch, before every destructive action (discard, revert, delete, force-push, mass replace), before applying a reviewed diff, on manual "Create checkpoint" from the palette, and automatically every 10 agent steps (ring buffer: keep the last 20, prune older with a size cap).
- **Revert:** the Review Changes sheet lists checkpoints (time, reason, author: user/agent, files touched, diff stats). Revert options: **Revert everything**, **Revert selected files**, **Open diff against checkpoint**. Revert is itself reversible — it creates a new checkpoint of the current state first.
- **Review Changes (diff-review parity):** a staged review of all agent/extension modifications with per-file and per-hunk accept/reject, "accept all in file", "reject all", inline comments that become context for the agent ("tell the agent about this line"), and a final **Apply** that writes atomically and produces one undo entry per file. Nothing is written until Apply is pressed when the project is set to `always ask`.
- **Storage & retention:** checkpoints are excluded from the file index and from git (`.mayank-ide/` is git-ignored by default), counted against a user-visible storage budget, and pruned by the policy in §16.2 (last 20, ≤ 500 MB by default).

### 9.11 Rules, skills, workflows & subagents (declarative agent customization)
- **Rules** (`MAYANK-IDE.md`, `AGENTS.md`, `.mayank-ide/rules/*.md`): always-on instructions. Discovery order: `project/MAYANK-IDE.md` → `project/AGENTS.md` → `.mayank-ide/rules/*.md` (alphabetical) → `~/.mayank-ide/rules/*.md`; conflicts resolve **nearest-wins**; the resolved rule set is shown in the session's Context Inspector ("Rules applied: 3 — tap to view") so agent behaviour is always explainable. Frontmatter: `appliesTo` (glob), `mode`, `priority`.
- **Skills** (`.mayank-ide/skills/<name>/SKILL.md`): named, invocable playbooks with frontmatter (`name`, `description`, `inputs`, `tools`, `model?`, `whenToUse`). Invoked explicitly (`/skill <name>`) or autonomously when the model matches `whenToUse`; every invocation logs its inputs and produced artifacts so results are reproducible and auditable.
- **Workflows** (`.mayank-ide/workflows/*.md`): deterministic multi-step sequences (e.g. `release.md`: run tests → bump version → update changelog → commit → tag → push, each step approval-gated). Same format as skills plus explicit `steps[]` with `onFailure: stop | continue | ask`.
- **Subagents** (`.mayank-ide/agents/*.md`): `name`, `description`, `tools` (allowlist), `model`, `mode`, `contextBudget`, and a system-prompt fragment. Ship two by default: the **Browser Subagent** (§10.4) and a read-only **Review Subagent** (reviews diffs against the plan, produces a review artifact with findings). Subagents inherit the parent's permission scope, can never widen it, and their token cost rolls up to the parent session.
- **Lifecycle hooks** (`.mayank-ide/hooks/*.js`, sandboxed in the Extension Host): `onSessionStart`, `onUserPrompt`, `onBeforeTool(tool, args) → { allow | ask | block, reason?, modifiedArgs? }`, `onAfterTool(tool, result) → { injectContext?, artifact? }`, `onFileSave(path)`, `onSessionEnd`. Hooks declare capabilities in frontmatter, cannot use the network unless `net` is declared, and a hook that throws is logged and skipped — it must never break the agent. Each hook shows a plain-language capability summary before activation.

### 9.12 Prompt library & iteration hygiene
`.mayank-ide/prompts/*.md` stores reusable prompts (`p`, `explain`, `test`, `refactor`, `review`, `fix-ci`) surfaced as palette commands with optional placeholder syntax (`{{selection}}`, `{{file}}`, `{{diff}}`, `{{diagnostics}}`). Prompt changes must be versioned, and any change to a system prompt used by the agent loop requires a golden-session regression test (§13.5) proving the loop still terminates and still respects permissions.

## 10. ARTIFACTS & THE BROWSER TOOL

### 10.1 Artifact model
An **Artifact** is a durable, structured deliverable the agent produces so a human can review and steer asynchronously instead of watching every tool call.
```ts
type ArtifactType =
  | 'implementation-plan'   // markdown: goal, assumptions, file-by-file changes, tests, risks, open questions
  | 'task-list'             // the Task Group serialized for review
  | 'walkthrough'           // narrated, step-by-step explanation of a completed change with code excerpts
  | 'diff'                  // a DiffApplyPlan with per-hunk decisions
  | 'diagram'               // mermaid or SVG architecture/flow diagram
  | 'screenshot'            // annotated image (browser or app preview)
  | 'recording'             // browser action recording (timeline of frames + actions)
  | 'note';                 // freeform markdown (research, findings, API notes)

interface ArtifactEnvelope {
  id: string; sessionId: string; projectId: string; type: ArtifactType;
  title: string; createdAt: number; updatedAt: number;
  status: 'draft' | 'awaiting-review' | 'approved' | 'changes-requested' | 'superseded' | 'archived';
  payloadRef: { path: string; mime: string; bytes: number; hash: string };   // under .mayank-ide/artifacts/<sessionId>/
  previewRef?: { thumbnailPath?: string; posterFrameMs?: number };
  linkedTasks: string[]; relatedFiles: string[]; version: number; supersedes?: string;
  review?: { reviewedAt?: number; decision?: 'approved' | 'changes-requested'; comments: ArtifactComment[] };
}
interface ArtifactComment { id: string; anchor?: { section?: string; file?: string; line?: number; tMs?: number };
  body: string; createdAt: number; sentToAgent: boolean }
```
Storage rules: payloads are files (never DB blobs), metadata is SQLite, every artifact is content-hashed, and superseding versions are kept so a plan's evolution is inspectable. Export/share produces markdown, PDF (via the HTML renderer), PNG for images, and MP4/GIF for recordings.

### 10.2 Artifact review UX (the steering loop)
- **Artifact tray:** in the HUD and the session screen, artifacts appear as cards with type icons, status chips, and unread dots; the rail "Agents" badge counts `awaiting-review` items.
- **Viewer:** full-screen, type-aware renderers — markdown with syntax-highlighted code fences, mermaid diagrams rendered with a pinch-zoom canvas, diff viewer (§5.3), image viewer with annotation toolbar (arrow, box, text, blur), recording player with a synchronized action timeline (§10.4).
- **Steering:** comment on any anchor (a plan section, a specific file/line in a diff, a video timestamp). Comments are queued to the agent with a **Send to agent** action; the agent must (a) acknowledge each comment, (b) update the artifact (new version, `supersedes` set), and (c) never proceed past an `awaiting-review` artifact in `always ask` projects. "Changes requested" flips the session back to `planning`.
- **Approval gates:** plan approval switches mode to `agent`; diff approval applies hunks; walkthrough approval closes the task group; every gate writes an audit-log entry with the actor (user) and the artifact version.

### 10.3 In-app preview & visual verification (mobile dev loop)
The preview system is what makes visual artifact verification possible on a phone without a laptop:
1. **Static previews:** HTML/SVG/Markdown/JSON rendered in a sandboxed preview pane.
2. **Live web preview:** if the project has a dev server (or the user provides a URL), the preview loads it in the **Browser Host** with mobile viewport presets (iPhone SE/14/15, Pixel, iPad, or custom W×H), device-pixel-ratio, orientation toggle, and a network panel. The agent can then verify its own UI change (§10.4 verification loop).
3. **React Native preview:** supported indirectly — if the project has Expo dev-server metadata (`.mayank-ide/remote.json` or a detected `expo start` on a remote PTY), offer "Open in Expo Go / dev client URL" via deep link, and expose the QR/link to the user. Do not claim to run a build on-device.
4. **Screenshot tooling:** capture preview frames as screenshot artifacts; annotate (arrow/box/text/blur) to create review comments; the agent can request a fresh screenshot at any time (`browser_screenshot`), which is attached to the turn.

### 10.4 Browser tool (Browser Subagent, recordings, isolated profile, allow/deny)
**Host:** `react-native-webview` inside the **Browser Host** WebView, loaded from local bundle with a strict configuration: no file access, no universal access from file URLs, navigation interception through the URL policy, cookie jar isolated to the browser tool ("separate profile" parity — the app's own sessions and the user's system browser are never touched), and no access to the device clipboard without permission.
**Capabilities (exposed as tools, §9.8):** `browser_open(url)`, `browser_snapshot()` → a compact, token-efficient representation (accessibility tree + key DOM roles/labels/text with stable element ids), `browser_act({ id, action: click|type|scroll|hover|select|press, value? })`, `browser_screenshot({ fullPage? })`, `browser_console()` (console + page errors, filtered/truncated), `browser_network()` (requests with status/timing; bodies redacted unless the domain is allowlisted), `browser_close()`.
**Determinism requirements:** every action waits for (a) element presence, (b) network quiet (configurable, default 500 ms of no in-flight XHR/fetch from the page's perspective where observable), and (c) an animation settle timeout; each action has a timeout with a structured failure ("element #12 not found — snapshot attached") so the model can recover; element ids are stable within a snapshot generation and the snapshot is invalidated after any navigation or DOM mutation beyond a threshold.
**Recordings (`recording` artifacts):** the host captures a frame on every action plus periodic frames during long operations (≤ 2 fps, capped at 60 frames / 20 MB), storing `{ tMs, action, elementId?, screenshotPath }`. Playback shows the images with a scrubbable action timeline, and comments can be anchored to a timestamp. Recordings are stored as artifacts and prune with the standard retention policy (default: keep 20 recordings, 30 days).
**Two-layer URL security (parity):** **Denylist** (always wins: admin/policy entries + defaults for auth/payment/banking patterns the user opts into) and **Allowlist** (if non-empty, only these hosts/subpaths are reachable). Both support host, host+path, and wildcard subdomains. Local dev targets (`localhost`, `127.0.0.1`, RFC1918, `.local`) require an explicit one-time acknowledgement per project. Every navigation and every `execute_url`-class action is permission-evaluated (`read_url` / `execute_url`), and blocked attempts produce a visible card ("Blocked by denylist: accounts.google.com") — never a silent no-op.
**Verification loop (the point of the browser tool):** when a task changes UI code, the agent must: open the target URL → snapshot → act to reproduce the scenario → screenshot → compare against the expected outcome (stated in the plan) → attach evidence to the turn and to the task in the Task Group → only then mark the task `done`. If verification fails, it must retry at most twice, then mark the task `blocked` with a screenshot artifact and ask the user — never claim success without evidence. Tests exist for: policy enforcement, snapshot stability, timeout recovery, recording frame caps, and the "verification evidence attached" invariant.
**User settings (`Browser` section):** toggle Browser Tools entirely off; per-project allow/deny editors; "screenshot quality/budget"; "capture recordings" (default on for verification runs, off otherwise); viewport presets; and a browser session inspector showing what the agent navigated to (privacy-transparent, exportable).

## 11. PHASE 2 — EXTENSION SYSTEM (VS Code-compatible, mobile-safe)

### 11.1 Goals & non-goals
**Goal:** run a declared, documented subset of the VS Code extension model — manifest, contribution points, activation events, a `vscode`-shaped API — inside a sandboxed Web Worker, so extensions written for VS Code can be adapted with minimal changes and mobile-specific extensions get a first-class runtime.
**Non-goal:** binary compatibility. There is no Node `require`, no `child_process`, no native modules, no `fs` beyond the virtual FS API, no webviews loading remote code. Every unsupported API throws a **typed, user-visible** error: `ExtensionAPIUnsupported: 'workspace.fs.watch' is not available on mobile (see docs/extension-runtime.md#fs-watch)`.

### 11.2 Manifest (`package.json` with `engines.mayank-ide`)
Same shape as VS Code so tooling and authors feel at home; `engines` targets both hosts.
```jsonc
{
  "name": "my-ext", "displayName": "My Extension", "version": "1.2.0",
  "publisher": "acme", "license": "MIT",
  "engines": { "mayank-ide": "^1.0.0", "vscode": "^1.85.0" },
  "categories": ["Formatters", "Linters"],
  "main": "./dist/extension.js",            // single bundled ESM/CJS file, no dynamic requires
  "mayank-ide": {
    "apiVersion": 1,
    "execution": "worker",                  // only value supported
    "permissions": {                        // capability manifest — shown at install
      "read_files": ["**/*.ts"],
      "write_files": ["**/*.json"],
      "network": ["https://api.example.com/**"],
      "clipboard": false,
      "agent_tools": ["acme.format"],
      "secrets": ["acme.apiKey"],           // scoped secret storage keys
      "ui_theme": false
    },
    "limits": { "maxMemoryMB": 64, "maxActivationMs": 400, "maxCpuSecondsPerMin": 10 },
    "offlineCapable": true
  },
  "activationEvents": ["onLanguage:typescript", "onCommand:my-ext.format"],
  "contributes": { /* see below */ }
}
```
**Supported `contributes` (v1):** `commands`, `menus` (context menus + palette), `keybindings`, `configuration` (+ `configurationDefaults`), `languages` (`extensions`, `filenames`, `aliases`, `configuration`), `grammars` (TextMate), `semanticTokenScopes`/`semanticTokenTypes`/`semanticTokenModifiers`, `snippets` (JSON), `themes` (color themes), `iconThemes`, `views` (into our sidebar containers: `explorer`, `scm`, `agents`, `terminal`, `problems`), `viewsWelcome`, `taskDefinitions`, `problemMatchers`, `problemPatterns`, `languageModelTools`, `chatParticipants`, `walkthroughs`, `jsonValidation`, `resourceLabelFormatters`, `notebooks` (**not supported** → reject at install with a clear reason).
**Unsupported contributions are rejected at install time with a precise message** ("This extension contributes `notebooks`, which Mayank IDE does not support") rather than installing something half-broken.

### 11.3 Supported `activationEvents` (subset with real semantics)
`onCommand:*` · `onLanguage:*` · `onView:*` · `onFileSystem:*` · `onTaskType:*` · `onUri` · `onStartupFinished` (rate-limited: max 5 extensions, activation deferred 3 s after first paint) · `workspaceContains:**/<glob>` · `onLanguageModelTool:*` · `onChatParticipant:*` · `onDebug:*` (DAP-lite only). `*` is **not allowed** — the installer warns and rewrites it to `onStartupFinished` with a user notice, because a cold start on a phone cannot afford eager activation of arbitrary code.

### 11.4 Extension host runtime
- One **Web Worker per extension** (`workers/extension-host.js`), created lazily on first activation, terminated on disable/uninstall/deactivate, and **hard-killed** on: uncaught exception, exceeding `maxMemoryMB`, exceeding `maxActivationMs`, or failing the protocol handshake.
- The worker receives a `vscode`-shaped API object built from a **host RPC client**: `commands`, `window` (messages, status bar items, quick picks, input boxes, progress), `workspace` (text documents, `fs` over VFS, configuration, `workspaceFolders`, `onDidChangeTextDocument`), `languages` (diagnostics, completion/hover/signature/code-action item providers, formatting), `scm`, `tasks`, `env`, `Uri`, `Range`/`Position`/`Selection`, `EventEmitter`, `Disposable`, `ThemeColor`, `TreeItem`, `ThemeIcon`, `extensions`, plus `secrets` (scoped, keychain-backed, permission-gated).
- **All file IO and network go through the host process**, which enforces the permission manifest per call and rate-limits (e.g. ≤ 20 file writes/s, ≤ 5 MB/s writes). Extensions never touch `expo-file-system`, the keychain, or `fetch` directly.
- **Cancellation & timeouts:** every provider call gets a `CancellationToken` and a 2 s budget (completion/hover), 10 s (format/diagnostics), 30 s (tasks). Blowing the budget degrades gracefully ("My Extension timed out") and counts toward the extension's health score; three timeouts in a session disable the extension with a banner.
- **Text edits:** returned as `WorkspaceEdit` objects applied by the editor host as one undo step; extensions can never write to disk without a save from the user (or an explicit `write_files` grant plus a user setting `mayank-ide.extensions.allowDiskWrites`).

### 11.5 Permission & trust model for extensions
- Every manifest permission is shown **before install** in plain language, with the concrete impact ("Read files matching `**/*.ts` in this project", "Send data to `api.example.com`"). The user may downgrade (e.g. deny network) at install; the app then blocks those calls at runtime with a typed error the extension can handle.
- **Runtime prompts** (mobile-shaped): the first time an extension exceeds its declared scope (or when it has no declaration), the permission card appears (§9.3b) with **Allow once / Allow for project / Deny**.
- **Publisher trust:** extensions are grouped into `verified publisher` (Open VSX verified), `known publisher` (installed before, hash unchanged), and `unverified`. Unverified extensions install only after an explicit "I understand the risk" confirmation, and are visibly badged in the UI at all times.
- **Integrity:** a VSIX (or marketplace payload) is verified for signature when available, and its content hash is stored; any change between the marketplace metadata and the downloaded bundle aborts the install. Non-signed extensions keep a local "review before update" behaviour for publisher or permission-set changes.
- **Uninstall is complete:** worker terminated, storage (IndexedDB/localStorage in the worker, plus host-side per-extension KV) wiped, contributed commands/menus/views removed, secrets optionally revoked, and a "what was removed" summary shown.

### 11.6 Mobile runtime constraints (Phase 2.3, expanded)
- **Size cap 20 MB per extension** (bundle after download, uncompressed). Marketplace listings show download size, install size, permissions, and last-updated date *before* install. Oversize extensions are refused with the actual size shown.
- **Failure isolation:** a crashed extension disables itself with a banner ("My Extension stopped working — Disable / Reload / Report"). It can never take down the editor, the agent, or another extension. Crash loops (2 crashes in 5 minutes) auto-disable.
- **Offline-first:** installed extensions work fully offline; marketplace metadata is cached for 7 days with an explicit "cached" indicator; install/update requires network and queues if unavailable.
- **CPU/thermal awareness:** extension work is scheduled through a single cooperative scheduler; when the device reports thermal throttling or low battery (< 15 % and not charging), background activation and non-essential providers are suppressed and the user is told why ("Extensions paused — battery saver").
- **Activation budget:** total extension activation ≤ 600 ms of JS time on first paint; a per-extension activation report is available in Extension details ("Activated in 180 ms — contributes 2 commands, 1 formatter").
- **Storage budget:** extensions get a 10 MB host-side KV by default; exceeding it requires a user-visible prompt.

### 11.7 Marketplace (Open VSX client)
- **Source:** Open VSX by default (open API, no proprietary ToS problems); an optional "VS Code Marketplace" source is **not** shipped due to licence/ToS constraints — document this clearly rather than shipping something gray.
- **Screens:** Browse (curated categories: Languages, Linters, Formatters, Themes, Snippets, SCM, Testing, AI, Utilities), Search (name/publisher/description, fuzzy + filters: category, verified-only, offline-capable, size, updated-within), Extension detail (readme rendered safely — markdown only, images cached, **no remote HTML/JS**), Versions (install any published version, pin, roll back), Reviews (rating + counts when available), Installed (enable/disable/update/uninstall, per-extension settings editor generated from its `configuration` contribution, "Open extension logs", "Report").
- **Install pipeline:** resolve version → check `engines.mayank-ide` compatibility → check unsupported contributions → compute permissions diff (on update: **"this update gains network access"** alert) → download with progress + cancel → hash verify → unpack to `extensions/<publisher>.<name>-<version>/` → register contributions → (lazy) activate on next matching event. Stalled downloads time out at 60 s and are retryable; a failed install leaves no partial state.
- **CSV/VSIX sideload:** "Install from file" via document picker, with the same verification, permission, and compatibility pipeline. This is the supported path for private/enterprise extensions.
- **Enterprise policy:** an admin JSON (`mayank-ide.policy.json` in the project root or pushed via MDM) can restrict allowed publishers, deny specific extension ids, force-disable network for extensions, and pin versions; violations are blocked with an explanatory banner.
- **Telemetry from the marketplace client:** none by default beyond crash reports; an explicit opt-in exists for usage analytics, and it never includes file contents or prompts.

### 11.8 MCP (Model Context Protocol) client — mobile-safe
**Transport support:** **streamable HTTP** (preferred) and **SSE**; **stdio is not supported on-device** by design (no process spawn). For stdio-only servers we offer two honest paths, both clearly labelled:
1. **Companion Relay (optional desktop/CLI helper):** a small Mayank IDE relay the user runs on a computer (`npx mayank-ide-relay`) that spawns stdio MCP servers and exposes them over authenticated WebSocket on the LAN or a tunnel. The app pairs via QR code, stores the pairing token in the keychain, and shows the relay's identity in the UI.
2. **Remote MCP host:** connect directly to an HTTP-transport MCP server (including those in a cloud dev environment) with OAuth or bearer auth.
**Server management UI:** add server (name, URL, auth kind, headers), test connection (5 s timeout, shows the server's protocol version + advertised tool count), enable/disable, per-server trust level, per-tool policy (allow/ask/deny — default `ask`), resource browsing (list `resources`, templates; opening a resource creates a context pill), prompt browsing (`prompts` → palette commands), roots exposure (we advertise project roots we are willing to share, **with a per-root toggle**), and a tool-call history view.
**Safety rules (non-negotiable):**
- MCP tool output is **untrusted content** — it is never mixed into the system prompt, always labelled as data, and any instruction-like content inside it is surfaced in the trace as "possible prompt injection" when it matches heuristics (imperatives, tool names, credential requests).
- Tool schemas are namespaced (`server__tool`), validated, and length-capped (a malicious 200 k-token description is truncated with a warning).
- Credentials for MCP servers live in the keychain; OAuth flows use PKCE with the system browser and deep-link redirect; tokens are scoped and revocable.
- Every MCP call is audit-logged with arguments (secrets redacted) and duration, and appears in the session's tool-call trace like any native tool.
- A server that declares tools with the same names as native tools can never shadow them; collisions get the server namespace prefix.
**Mobile limits stated in the UI:** no stdio servers, no local socket transports, background MCP work only while the app is foregrounded or an agent foreground service is running.

## 12. SECURITY, PRIVACY & COMPLIANCE

### 12.1 Secret storage hierarchy
| Tier | Store | Contains | Access rule |
|---|---|---|---|
| **T1 Secrets** | `react-native-keychain` (Keychain / Keystore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, no cloud backup) | Provider API keys, OAuth refresh tokens, git tokens, MCP tokens, custom-endpoint headers, extension secrets | Read only on demand; every read requires an unlocked device and, for reveal/copy, a biometric check |
| **T2 Sensitive config** | Encrypted file (key in keychain) | Provider preferences without secrets, remote targets' usernames, enterprise policy | Read on demand |
| **T3 Non-sensitive** | MMKV / SQLite | Layout, tabs, sessions, artifacts, usage ledger, index | Normal access |
Explicitly forbidden: secrets in MMKV/SQLite/AsyncStorage/Zustand persist, secrets in crash reports, secrets in exported diagnostics, secrets in git, secrets in screenshots (a "hide secrets" toggle masks masked fields in the screen-recording/secure-view path).
Key **lifecycle:** add → test → rotate (replace value, keep metadata and a `rotatedAt` timestamp), revoke (delete + clear caches keyed by that fingerprint), export (never), and an "in use by" list showing which sessions/features use each key. A **key fingerprint** (first 4 + last 4 chars, hashed) is displayed so users can identify keys without exposing them.

### 12.2 Transport & data handling
- TLS-only by default with certificate validation; **no** "ignore certificate errors" switch in the UI (mTLS/self-signed is an enterprise build option documented in an ADR).
- Provider requests include only the context the user approved; the Context Inspector shows a byte/token breakdown **per destination** before the first request of a session ("sending 12 files, 4 terminal outputs, 1 screenshot to api.openai.com").
- No file contents or prompts leave the device for analytics, crash reporting, or remote config — ever. Crash reports are scrubbed of file paths? No: **paths are redacted to `‹project›/relative/path`** form; contents are never included.
- Artifact media (screenshots/recordings) are stored locally, never uploaded unless the user shares them or sends them to a provider deliberately.
- Data-retention controls: index, artifacts, checkpoints, terminal buffers, and audit logs each have an explicit retention setting with a "Clear now" action and a size readout.

### 12.3 Threat model & mitigations (mobile-specific)
| # | Threat | Mitigation | Test |
|---|---|---|---|
| T1 | Key exfiltration by a malicious extension | Extensions never touch the keychain directly; `secrets` are scoped per extension id and permission-gated; network egress restricted to declared hosts; all egress logged | E2E: extension declaring `network: []` attempting fetch → blocked + audit entry |
| T2 | Prompt injection from repo content, MCP output, browser pages, or issue text | Untrusted content is labelled as data; tool results never enter the system prompt; injection heuristics flag and warn; destructive tools always `ask` unless explicitly pre-approved; no tool can widen its own permissions | Fixture repo with hostile `README.md` attempting to trigger `git_push` → denied + trace flag |
| T3 | Agent writes/deletes outside the project | Permission engine with normalized path matching; denials for paths outside roots; symlink-ish escape attempts resolved and rejected | Property tests over path normalizer; E2E attempt to write `../../etc/passwd` equivalent |
| T4 | Secret leakage into logs/diagnostics | Central logger with pattern redaction (`sk-[A-Za-z0-9]{20,}`, `AIza…`, JWTs, `-----BEGIN … PRIVATE KEY-----`), redaction unit tests, and a "redaction self-test" in Settings → Diagnostics | Unit + golden-file tests on log samples |
| T5 | Screenshot/clipboard leakage of keys | Masked fields with biometric reveal, secure-view flag on secret screens, clipboard auto-clear after 60 s with a toast, no key material in accessible labels | Device test checklist |
| T6 | Malicious MCP server | Explicit trust per server, per-tool policy default `ask`, schema/size caps, output treated as untrusted, token scoping + revocation | Integration test with a hostile mock server |
| T7 | Compromised provider endpoint / MITM | TLS only, pinned hosts for known providers, custom endpoints require HTTPS unless local, warnings for insecure local endpoints, response sanity checks (content-length, JSON shape) | Unit tests on the custom-endpoint validator |
| T8 | Supply-chain risk from dependencies | Lockfile + `npm audit` gate, dependency review on PR, no post-install scripts without review, pinned versions, Dependabot-equivalent, SBOM generated per release | CI job |
| T9 | Lost/stolen device | OS-level protection + keychain `THIS_DEVICE_ONLY`, optional app-lock (biometric) with a configurable timeout, no secrets in backups (verified empirically), remote revoke instructions in the docs | Manual device test |
| T10 | Data exfiltration via "harmless" features (telemetry, remote config) | Telemetry opt-in, no file contents, schema-validated event list, remote config limited to flags/strings (no code), egress audit log | Code review + runtime egress monitor in dev builds |
| T11 | Extension supply chain | Verified publisher signal, hash pinning, permission-diff alerts on update, sideload-only for private extensions, enterprise allowlists | Install-flow tests |
| T12 | Untrusted workspace (cloned repo) executing something | Workspace trust gate (Restricted mode default for newly cloned repos): no agent writes, no extension activation, no tasks, no MCP | E2E: clone → verify restricted badge → attempt task → blocked with explanation |

### 12.4 Secret redaction pipeline (single implementation, used everywhere)
`redact(text, opts)` runs in three places: (1) before logging, (2) before writing diagnostics bundles, (3) before sending file contents to providers when the file matches a secret pattern. Patterns are configurable (add your own company prefixes), with a **self-test screen** showing a sample string and the redacted output so users can verify rules are active. Redaction is never "best effort silent": when a file is redacted for the model, the model receives an explicit marker `‹redacted: 3 secrets hidden by policy›` and the trace records it.

### 12.5 Privacy, compliance & enterprise
- **Data map** (documented in `docs/privacy.md`): what is stored where, what leaves the device (only provider requests the user initiates), and what is never collected.
- **User controls:** offline mode (hard block on all network except explicitly allowed endpoints), telemetry opt-in, analytics off by default, "delete my data" (wipes index/artifacts/sessions/audit log with a confirmation that lists exact paths), export my data (JSON bundle of sessions/artifacts/settings minus secrets).
- **Enterprise/MDM:** managed config keys for allowed providers, blocked providers/domains, forced offline, telemetry off, allowed extension publishers, and a policy-file override; all signed-config reads are logged. SOC 2-friendly audit surfaces: agent activity log, provider egress log, extension install history, permission decisions (exportable JSON/CSV).
- **Compliance guardrails:** never claim certifications you do not hold; the app shows a "Security & Privacy" page with accurate statements generated from the actual implementation (this page is part of the Definition of Done for M12).

## 13. DESIGN SYSTEM, ACCESSIBILITY & QUALITY ENGINEERING

### 13.1 Design tokens & system
Single source of truth `src/shared/design/tokens.ts`, exported as typed objects and consumed by the theme provider (no inline hex values anywhere — lint rule).
- **Color:** semantic palette (`bg.canvas`, `bg.surface`, `bg.raised`, `bg.overlay`, `border.subtle`, `border.strong`, `text.primary/secondary/muted`, `accent`, `success`, `warning`, `danger`, `info`, syntax roles `syntax.keyword/string/number/comment/function/type/variable/punctuation`). Light, dark, and **high-contrast** variants; themes extend these tokens so extension color themes are token-mapped rather than raw CSS injection.
- **Typography:** JetBrains Mono (+ NL for ligature-free rendering) bundled for the editor; platform UI font for chrome; scale `11/12/13/15/17/20/24/32` with 1.15–1.35 line heights; **editor font scales independently** (10–22 px, pinch + settings + status-bar long-press); all type respects OS Dynamic Type up to 200 % with a layout audit per screen.
- **Spacing & radius:** 4-based scale (4/8/12/16/20/24/32), radius `6/10/14/20/full`. Tap targets ≥ 44 dp (iOS) / 48 dp (Android) enforced by a shared `Touchable` primitive.
- **Elevation/shadow:** three levels max, GPU-cheap, disabled in high-contrast mode.
- **Motion presets:** `enterSheet`, `enterModal`, `listItem`, `diffReveal`, `hapticTick` — one place to tune, one place to respect reduced motion.
- **Component inventory (build these first, in this order):** `Button`, `IconButton`, `Chip`/`ChipRow`, `Card`, `ListRow`, `SectionHeader`, `BottomSheet`, `Drawer`, `Modal`, `SegmentedControl`, `Tabs`/`TabStrip`, `TextField`, `MaskedField`, `Switch`, `Slider`, `Stepper`, `Badge`, `StatusDot`, `Toast`/`Snackbar`, `Banner`, `ProgressBar`, `Skeleton`, `EmptyState`, `ErrorState`, `ConfirmDialog`, `ContextMenuSheet`, `ActionSheet`, `Avatar`, `Tag`, `Tooltip`(long-press), `KeyValueList`, `CodeBlock`, `DiffView`, `Tree`, `KeyLabel` (physical-key glyphs), `HudSheet`, `PermissionPromptCard`, `ArtifactCard`, `TaskListItem`, `ProviderCard`, `UsageMeter`, `OnboardingStep`, `SearchField`.
- **Empty & error states are first-class:** every list/view ships an `EmptyState` with a primary action and a one-line explanation, and an `ErrorState` with a retry. A blank screen is a bug.

### 13.2 Settings information architecture
`Settings` = searchable list grouped as: **Appearance** (theme, editor font, density, reduced motion), **Editor** (tab size, insert spaces, word wrap, minimap, line numbers, auto-save, format-on-save, vim mode, ghost text), **Keyboard & Toolbar** (toolbar row layout, key repeat, gesture enable/disable, hardware-keyboard shortcuts), **Files & Projects** (default save location, excludes, re-index, storage usage), **Git** (identity, auth, auto-push, commit templates), **AI Providers** (§8.4), **Agent** (modes defaults, approval policy, context budget, checkpoints retention, rules/skills management, hooks), **Browser** (tools on/off, allow/deny lists, viewport presets, recording settings), **Terminal** (targets, shells, fonts, scrollback), **Extensions** (installed list, activation timings, storage usage, policy), **Security & Privacy** (app lock, biometric gate, redaction rules, agent activity log, data retention, clear data), **Advanced** (open `settings.json`, diagnostics bundle, feature flags, reset onboarding, about/licenses).
Two representations of the same state, kept in sync: the **GUI** and `settings.json` (workspace `.mayank-ide/settings.json` overriding user settings, VS Code precedence order: default < user < remote < workspace < folder). Unknown keys are preserved on write (never dropped), and every setting has a `description` + `scope` shown in the UI.

### 13.3 Accessibility (must-pass, not best-effort)
- Every interactive element has an accessible label; icon-only buttons must state their action ("Close tab Editor.tsx").
- Screen-reader support for the editor: caret position announcements throttled sensibly, line-content reading on demand, and a **non-editor "reader mode"** for reviewing files line-by-line (essential for editing with VoiceOver/TalkBack since a WebView editor is not fully screen-reader-editable).
- Focus order follows visual order; sheets trap focus and restore it on dismiss; hardware keyboard can reach every control (`Tab` traversal, visible focus rings, `Esc` closes topmost layer).
- Contrast ≥ 4.5:1 for text and ≥ 3:1 for UI in all three themes; verified by an automated token-contrast test in CI.
- No information conveyed by color alone (git decorations, diagnostics, diff markers include icons/labels).
- Dynamic Type up to 200 %: layouts reflow, never truncate critical controls; tested at 200 % for the golden-path screens.
- Reduce Motion respected; haptics individually disableable; no auto-playing audio/video; recordings never autoplay with sound.

### 13.4 Internationalization
String catalogs (`i18next`), no concatenated sentences, pluralization-aware, RTL support via logical properties (`start/end`, not `left/right`) with a mirrored swipe/gesture mapping, locale-aware date/number formatting, and a CI check for missing keys. Ship `en` first with the infrastructure ready (no hardcoded user-facing strings — lint rule with an allowlist for logs).

### 13.5 Testing strategy (pyramid + the tests that actually catch mobile bugs)
| Layer | Scope | Tooling | Gate |
|---|---|---|---|
| Unit | Permission matcher, path normalizer, SSE parser, diff/hunk engine, task state machine, token estimator, policy validator, redaction, settings precedence, model router | Jest + `fast-check` (property tests for matchers/parsers) | CI, 100 % of these modules |
| Contract | Host bridge protocols (editor/language/index/terminal/browser/extension), provider adapters (recorded HTTP fixtures) | Jest with shared fixtures + a JSON-schema validator for every message | CI |
| Component | Primitives, sheets, diff view, keyboard toolbar, permission card (render + interaction) | `@testing-library/react-native`, snapshot only for stable primitives | CI |
| Integration | Zustand↔SQLite↔FS flows with an in-memory/mock VFS; git adapter against a fixture repo; extension host with a sample extension; MCP against a mock server | Jest + fixtures | CI |
| E2E (golden paths) | Maestro flows on a Tier-A emulator + iOS simulator | Maestro (+ optional Detox for iOS-only visual checks) | CI on main, nightly full matrix |
| Performance | Cold start, keystroke latency, scroll jank, memory soak, index throughput | Instrumented marks + `scripts/verify-budgets.ts` | CI, fails on > 10 % regression |
| Security | Egress monitor (dev build), permission-denial scenarios, secret redaction goldens, extension sandbox escapes | Jest + E2E flows | CI |
| Accessibility | Contrast tokens test, label coverage test (every interactive node has a label), 200 % font screenshots | Jest + Maestro screenshots for review | CI + manual audit per release |
| Golden sessions | Scripted agent runs against a fake provider: plan → approve → edit → verify → commit, including failure/retry paths | Custom harness with recorded model streams | CI (regression on prompt/loop changes) |

**E2E flows to implement (minimum 12):** cold start to editable · open file from explorer · edit with toolbar keys + undo/redo · tab management (open/close/reorder/undo close) · search + replace-all confirmation · source control commit (with checkpoint) · provider key add → test connection → model select · agent ask (read-only) · agent plan → approve → apply diff · permission prompt deny → agent adapts → allow-for-session · browser verification run producing screenshot artifact with evidence · extension install → command runs → disable on crash. Plus offline variants for flows 1, 2, 3, 5 and the agent path with a local model.

### 13.6 Telemetry, diagnostics & measurement (privacy-preserving)
- **Opt-in only**, off by default; the toggle copy states exactly what is sent.
- Allowed event payloads are **schema-validated** and contain no file contents, no prompts, no code, no paths beyond a redacted `‹project›/relative` form, no key material. Event list: app launch (timings), screen views, feature usage counters (`agent_session_started`, `agent_plan_approved`, `agent_tool_denied`, `diff_applied`, `extension_installed`, `provider_test_connection`, `permission_prompt_shown/answered`, `browser_verification_completed`, `offline_mode_toggled`, `crash`, `anr`, `host_crash`), and perf metrics from §4.9.
- **Diagnostics bundle** (`Copy diagnostics`): app/build versions, device model/OS, settings (redacted), installed extensions + versions, provider config **without keys**, recent log ring buffer (redacted), host/perf counters, and last crash stack. Users can preview the bundle contents before copying.
- **Dashboards that matter:** crash-free sessions, agent success rate, tool denial rate, plan-approval latency, first-session time-to-first-plan, provider error mix, perf percentiles (p50/p95) for start/typing/scroll/index.

### 13.7 Release, versioning & rollback
- **Versioning:** semver; `MAJOR.MINOR.PATCH` + build number; protocol versions are separate (`editorBridge: 1`, `extensionApi: 1`) and breaking changes require a migration + compatibility shim for one minor release.
- **Channels:** `dev` (internal), `beta` (TestFlight/internal track), `stable` (App Store/Play). OTA (`expo-updates`) for JS-only fixes with a staged rollout (10 % → 50 % → 100 %) and a documented rollback path ("roll back to previous update") that must be tested each release.
- **Store compliance checklist:** iOS background-execution justification, notification permission rationale strings, Android foreground-service type and rationale, data-safety form accuracy, privacy policy URL, and a "no dynamic code execution" statement matching the extension sandbox design.
- **Release checklist:** all gates green · budgets reported · Maestro full matrix green · accessibility audit done · privacy page updated · crash-free baseline checked · rollback tested · release notes drafted from the milestone ledger.

## 14. PHASE 4 — ROADMAP: MILESTONES, DoD, DEMOS

Each milestone is a shippable vertical slice. **Do not start a milestone before its dependencies are green in CI.** Estimates assume one strong engineer plus the AI agent working the loop; ⇉ marks milestones that can overlap with the previous one once interfaces are frozen.

| ID | Milestone | Scope highlights | Definition of Done (exit criteria) | Demo (2 min) | Est. |
|---|---|---|---|---|---|
| **M0** | Foundations | Repo, CI (typecheck/lint/unit/dep-cruiser), design tokens + primitives, error taxonomy, logger with redaction, settings store + `settings.json`, i18n scaffolding, Maestro skeleton, device-matrix doc | App builds on both platforms; CI green; 10 primitives tested; diagnostics bundle works; ADR log started | Open app → configure theme → copy diagnostics | 1–1.5 wk |
| **M1** | Shell & navigation | Breakpoints, rail/drawer, explorer, tabs, breadcrumbs, status bar, palette skeleton, haptics, onboarding gestures, keyboard-rect handling | All navigation usable one-thumbed; 60 fps on Tier-A; Maestro flows 1–4 green; budgets reported | One-handed tour: open project → navigate → switch tabs → palette | 2 wk |
| **M2** | Editor core | Editor Host + bridge, CodeMirror config, folding, diagnostics UI, find-in-file, diff view, large-file mode, crash recovery | Contract tests green; typing < 16 ms with 5 k lines; diff review toggles work; state replay after host crash | Type in a 5 k-line file, fold, find, review a diff | 2–2.5 wk |
| **M3** | Touch editing layer | Cursor wheel, loupe + selection handles, keyboard companion toolbar, gesture vocabulary, multi-cursor, cursor history, snippets/Emmet, ghost-text accept chip | Every gesture works and is toggleable in Settings; toolbar fully customizable; a11y labels present | Edit a file entirely by thumb: symbols, wheel, multi-cursor, snippet | 2 wk |
| **M4** | Files, projects, search | VFS + providers (sandbox, SAF, iCloud, SFTP), project model, trust/restricted mode, index worker, search + replace, Problems sheet | 5 k files indexed incrementally < 30 s on Tier-A; streaming results; trust gate enforced; offline works | Import a folder, search + replace, show restricted-mode enforcement | 2.5 wk ⇉ |
| **M5** | Git & source control | isomorphic-git adapter, fast clone, staging, diff, commit, branch, stash, conflicts, offline push queue, checkpoint integration | Fixture-repo integration tests green; conflict resolution E2E; no silent clobber (mtime guard tested) | Clone via PAT → edit → commit → resolve a conflict → push | 2.5 wk ⇉ |
| **M6** | AI providers & keys | Keychain layer + biometric gate, all adapters (§8.1), model discovery, custom endpoint builder, test connection, fallback router, usage ledger, Providers screens | Recorded-fixture tests for every adapter incl. cancellation + error mapping; zero key material in logs (tested); 5 s timeouts enforced | Add key → test → discover models → switch → show fallback pill + undo | 2.5 wk ⇉ |
| **M7** | Agent runtime & HUD | Session model, modes, resumable loop, tool registry + core tools, permission engine + prompt card, audit log, Task Groups, agent HUD | Golden-session tests pass (plan→approve→edit→verify); resume-after-kill passes; every tool permission-gated; denial path tested | Ask → plan → approve → agent edits → review diff → approve | 3 wk |
| **M8** | Artifacts, Agents Space, checkpoints | Artifact store + 8 types, review/steer loop, Agents Space dashboard, Task Group editing, checkpoints + revert + Review Changes | Artifact versioning and comment→agent loop tested; revert restores byte-identical state; parallel-agent file lock tested | Two agents in parallel; review a plan; steer with a comment; revert a checkpoint | 3 wk ⇉ |
| **M9** | Browser tool & preview | Browser Host, snapshot/act/screenshot/record, URL denylist + allowlist, isolated profile, viewport presets, verification loop, static/live previews | Policy enforcement tests; snapshot stability tests; "evidence attached before task done" invariant; recording caps enforced | Agent fixes a UI bug and proves it with a screenshot + recording | 2.5 wk ⇉ |
| **M10** | Terminal, tasks, debug-lite | PTY protocol + xterm host, SSH/WS targets, builtin command surface, session tabs, tasks.json + discovery, problem matchers, test-runner parsing, DAP-lite client, `.http` requests | Reconnect/backpressure tests; task → problems → agent-fix loop E2E; all mobile toolbar keys functional | Run a remote test suite, jump to a failure, ask the agent to fix it | 3 wk ⇉ |
| **M11** | Extension system & marketplace | Manifest + validator, worker host + API surface, contribution points, activation events, permission prompts, Open VSX client, install/update/rollback, VSIX sideload, failure isolation | Sample extension repo (formatter, linter, theme) passing the full lifecycle; crash-disable test; offline marketplace cache test | Install a formatter extension → run it → break it → auto-disable banner | 3.5 wk ⇉ |
| **M12** | Ecosystem & polish | MCP client (+ relay), skills/rules/workflows/subagents/hooks, remaining slash commands, E2EE settings sync (non-secret), i18n, a11y audit, budget hardening, store submission, Security & Privacy page | All budgets met on Tier-A; a11y audit passed; 12 E2E flows green on the matrix; store checklists complete; privacy page accurate | Full end-to-end: clone → plan → apply → verify in browser → commit → push → install extension | 3 wk |

### 14.1 Sequencing notes & critical path
- **Critical path:** M0 → M1 → M2 → M3 (editor must feel great before agents matter) → M6 (providers) → M7 (agent runtime) → M8 (artifacts/checkpoints) → M9 (browser verify) → M11 (extensions).
- M4/M5 can proceed in parallel with M2/M3 once the VFS + git interfaces are frozen, because they touch different modules.
- M10 (terminal) is independent of the agent milestones except for `run_command`; ship the tool stub early returning a clear "connect a terminal target" error so M7 is not blocked.
- M12 items are deliberately last: they polish surfaces that only make sense once the core loop is trustworthy.
- **Freeze points:** after M1, freeze the shell topology interfaces; after M2, freeze the editor bridge protocol v1; after M6, freeze `ProviderAdapter`; after M7, freeze `AgentTool` + `PermissionRule`; after M11, freeze the extension API surface for a full minor version.

### 14.2 Risk register (top 8 — review at every milestone boundary)
| Risk | Impact | Mitigation / early trigger |
|---|---|---|
| CM6-in-WebView input latency on low-end Android | High — kills the core value | Prototype in M0–M1 against the hard 16 ms budget; if missed, ADR with a fallback native-input-overlay plan before M3 starts |
| isomorphic-git performance/memory on real repos | High | Fast-clone path, repo-size warnings with estimates; benchmark 3 real repos (small/medium/large) during M5 |
| Remote-only heavy-language intelligence disappoints | Medium | Tier A covers JS/TS first (largest audience); honest tier labels in the status bar; one-tap remote setup wizard |
| Extension expectations exceed the supported subset | Medium | Publish the compatibility matrix early; precise install-time rejection messages; maintain a sample extension repo |
| Provider API churn (streaming/tool-call shapes) | Medium | Adapter contract tests with recorded fixtures, provider-health screen, quick-release channel |
| iOS background limits break Goal mode | Medium | Explicit pause/resume semantics, notification-driven continuation, honest copy — never promise unlimited background runs |
| Cost surprise for BYOK users | Medium | Pre-send estimates, session caps, pause-on-budget, usage screen, "local model" nudges |
| Scope creep (notebooks, native debug, local runtimes) | High | §1.7 non-goals enforced in review; new scope requires an ADR **and** removing equivalent scope |

### 14.3 Staffing & parallelization (if more than one engineer)
- **Track A (workbench):** shell, editor host, touch layer, terminal/preview surfaces.
- **Track B (data):** VFS/providers, index/search, git, artifacts/checkpoints storage.
- **Track C (intelligence):** providers, agent runtime, tools, permissions, browser tool.
- **Track D (platform/ecosystem):** extension host + marketplace, MCP, skills/hooks, security & release engineering.
Shared contracts (§16) are the coordination surface: any change requires a version bump, a migration note, and a 24-hour comment window before implementation.
The builder working protocol (first actions, slice workflow, templates, conventions, escalation, handoff) follows immediately in §15.

## 15. AGENT WORKING PROTOCOL (how you, the builder, operate)

### 15.1 First ten actions when you start work (do these in order)
1. Read this document end-to-end; list every section you cannot implement as written, and ask (`§0.5`) before writing code.
2. Bootstrap the repo skeleton from §3.2 with buildable placeholders **that fail loudly** (e.g. an unimplemented screen shows a real "Not implemented in M<n>" state, not a fake UI).
3. Set up the gates: typecheck, lint, unit tests, dependency-cruiser, Maestro smoke — and prove each one can fail (introduce a deliberate violation, observe the failure, revert).
4. Write the design tokens + the first 10 primitives with tests (M0 scope).
5. Write `docs/status.md`, `docs/assumptions.md`, `docs/adr/0001-initial-decisions.md` templates and use them from the first slice.
6. Implement M0 to completion — do not start M1 with an unfinished gate.
7. For each subsequent milestone: `docs/plans/M<n>.plan.md` → human sign-off (if the plan touches §12, §9.3b, or any §16 contract) → slices → gates → ledger entry.
8. Keep a single "current slice" in flight; do not batch five barely-working features.
9. Re-run the budget check and the offline flow at every milestone end.
10. At each milestone end, write a 10-line summary that a non-engineer could read (what works, what does not, what is next).

### 15.2 Slice workflow (repeat verbatim)
```
1  Pick the next slice from the milestone plan; state it in one sentence.
2  Write the failing test(s) FIRST (unit or Maestro flow), run them, show the failure.
3  Implement the minimum code to pass, in ≤ 500 LOC of diff.
4  Run: typecheck · lint · unit · (flow if UI) · budget check.
5  Add the edge cases; keep coverage ≥ 80 % on changed files.
6  Verify offline + one accessibility pass (label coverage, 200 % font).
7  Update status.md + ADR (if a decision) + this prompt's spec (if it changed).
8  Report using the §0.4 format. Then, and only then, start the next slice.
```

### 15.3 Plan template (`.mayank-ide`/`docs/plans/M<n>.plan.md`)
```
# M<n> — <title>
## Goal (user-visible outcome, one paragraph)
## Out of scope (explicit)
## Affected areas (core/features/platform/workers/docs) + files created/modified (list)
## Data contracts touched (schemas, migrations, protocol versions)
## Permissions/security impact (new tools, new egress, new secrets — or "none")
## Performance impact (expected budget deltas)
## Test plan (unit · contract · integration · E2E · perf · a11y)
## Slices (ordered, each ≤ 500 LOC with a one-line DoD)
## Rollback plan (feature flag name, revert steps)
## Open questions (max 3, each with a DEFAULT-IF-SILENT)
```

### 15.4 ADR template (`docs/adr/NNNN-title.md`)
`Status · Context · Decision · Alternatives considered · Consequences (good/bad) · Reversibility · Date · Links to code + tests`. Write an ADR for: adding/removing a dependency, changing a data contract, changing permission semantics, deviating from any spec in this document, choosing a library over an alternative, or accepting a budget exception.

### 15.5 Git & commit conventions
- Branches: `m<milestone>/<slice-slug>` (e.g. `m7/agent-loop-resume`). One slice per branch.
- Commits: Conventional Commits (`feat(agent): persist session state after every tool call`), body explains **why**, footer references the milestone (`Refs: M7`).
- Never commit: secrets, `.env`, build output, large binaries, recordings > 5 MB, or `settings.json` containing personal endpoints.
- PR description must include: slice DoD checklist, gate output summary, screenshots/GIF for UI, budget deltas, and explicit "verified vs assumed" split.

### 15.6 Review checklist (apply to your own diffs before requesting review)
- [ ] Does it do what §<n> says, exactly? Any deviation is documented.
- [ ] Are permissions enforced (not just declared) for every new capability?
- [ ] Are secrets untouched by logs/persist/telemetry (grep for the field names)?
- [ ] Are all failures surfaced with a reason and an action (no silent catch, no infinite spinner)?
- [ ] Does the offline path work, or does it clearly state that it needs network?
- [ ] Are the strings i18n-ready and are labels present for every control?
- [ ] Is the UI thread untouched (no sync FS, no heavy parse, no blocking JSON)?
- [ ] Is the change reversible (flag, checkpoint, or revert path)?
- [ ] Do the tests prove the behaviour rather than the implementation?

### 15.7 Escalation & honesty rules
- **Never** claim a device test passed if you cannot run it: say "not executed on a device — needs manual verification by <person/step>".
- **Never** invent measurements. Report only observed numbers, and label estimates as estimates.
- If a library's real behaviour contradicts its docs, write it in the ADR and in `/docs/gotchas.md` so nobody rediscovers it.
- If you must ship a limitation, it goes in three places: the UI (user-visible), the docs, and the risk register.
- Prefer boring, testable solutions over clever ones. Prefer deleting code to adding it. Prefer explicit over implicit.

### 15.8 Handoff (what a new engineer/agent needs on day one)
`README.md` (setup in ≤ 10 commands) · `docs/architecture.md` (a 2-page distillation of §3) · `docs/status.md` (where we are) · `docs/plans/` (the next 2 milestones) · `docs/adr/` (why things are the way they are) · `docs/gotchas.md` (platform traps discovered) · `CONTRIBUTING.md` (how to add a provider, a tool, a language, an extension) · `docs/device-matrix.md` + a seeded demo workspace + a fake provider fixture so a new contributor can run agent flows without any API key.

## 16. DATA CONTRACTS & SCHEMAS (freeze before implementing; version any change)

### 16.1 Cross-cutting types
```ts
type Uri = string;                       // provider://<rootId>/<relative/path>
interface TextEdit { range: { startLine: number; startColumn: number; endLine: number; endColumn: number }; newText: string }
interface HunkDecision { hunkId: string; decision: 'accept' | 'reject' | 'edit'; editedText?: string; comment?: string }
interface DiffApplyPlan {
  id: string; sessionId: string; source: 'agent' | 'extension' | 'user' | 'scm';
  files: Array<{
    uri: Uri; languageId: string; baseHash: string; resultHash: string;
    hunks: Array<{ id: string; header: string; baseRange: [number, number]; newRange: [number, number];
                   lines: Array<{ kind: 'context' | 'add' | 'del'; text: string }>; decisions?: HunkDecision[] }>;
    status: 'pending' | 'applied' | 'rejected' | 'conflicted';
  }>;
  preconditions: { expectedMtime?: Record<Uri, number>; requiredCheckpoint?: string };
  createdAt: number;
}
interface ContextPill {
  id: string; kind: 'selection' | 'file' | 'folder' | 'diff' | 'terminal' | 'artifact' | 'image' | 'url' | 'mcp-resource' | 'problems';
  label: string; ref: Record<string, string>;               // e.g. { uri, startLine, endLine }
  tokens: number; removable: boolean; addedBy: 'user' | 'agent' | 'auto';
}
interface CheckpointRef { id: string; kind: 'git' | 'vfs'; ref: string; label: string; createdAt: number;
  reason: 'agent-write' | 'destructive' | 'manual' | 'auto-step' | 'pre-apply'; filesTouched: string[]; bytes: number }
interface ToolSchema { name: string; description: string; parameters: JSONSchema; strict?: boolean }
interface TaskGroup { /* §9.5 */ }
interface ArtifactEnvelope { /* §10.1 */ }
interface PermissionRule { /* §9.3b */ }
```
### 16.2 Storage keys & locations (single registry; nothing is written anywhere else)
| Store | Key / path | Contents |
|---|---|---|
| Keychain | `mayank-ide.provider.<providerId>` | `{ apiKey \| refreshToken, addedAt, label, fingerprint }` |
| Keychain | `mayank-ide.git.<host>.<user>` | PAT / OAuth token for git hosts |
| Keychain | `mayank-ide.mcp.<serverId>` | bearer/OAuth tokens |
| Keychain | `mayank-ide.crypto.appKey` | app-level encryption key for T2 config |
| Keychain | `mayank-ide.biometric.gate` | flag + last-auth timestamp (gate only, never a secret) |
| MMKV | `ui.*` | layout, theme, density, tab order, HUD state |
| MMKV | `cache.models.<provider>.<urlHash>` | model lists (24 h TTL) |
| MMKV | `cursor.<projectId>.<fileHash>` | line/column/scroll/fold state |
| MMKV | `flags.*`, `recent.*`, `toolbar.*` | feature flags cache, recents, toolbar layout |
| SQLite | `projects`, `roots`, `files`, `symbols`, `fts_files`, `sessions`, `task_groups`, `tasks`, `artifacts`, `artifact_comments`, `checkpoints`, `permission_rules`, `audit_log`, `usage_ledger`, `extensions`, `mcp_servers`, `settings_kv` | as named; migrations are versioned and reversible |
| Filesystem | `<project>/.mayank-ide/` | `settings.json`, `keybindings.json`, `snippets/`, `artifacts/<sessionId>/`, `checkpoints/<id>/`, `remote.json`, `prompts/`, `rules/`, `skills/`, `workflows/`, `agents/`, `hooks/`, `commands/` |
| Filesystem | App support dir | `logs/`, `diagnostics/`, `extensions/<publisher>.<name>-<version>/`, `tmp/`, `blobs/<sha256>` (tool-result overflow) |
**Retention defaults (user-configurable):** logs 7 days / 20 MB · audit log 30 days · artifacts 90 days (keep 20 recordings max) · checkpoints last 20 (≤ 500 MB) · terminal buffers off · blobs 7 days. A "Storage usage" screen shows each category's size with a one-tap clear.

### 16.3 Extension API surface (v1 summary — full list in `docs/extension-runtime.md`)
`commands.registerCommand/executeCommand/getCommands` · `window.showInformationMessage/showWarningMessage/showErrorMessage/showQuickPick/showInputBox/showOpenDialog/withProgress/createStatusBarItem/createOutputChannel/activeTextEditor/visibleTextEditors/onDidChangeActiveTextEditor/onDidChangeTextEditorSelection` · `workspace.fs (VFS)`, `workspace.workspaceFolders`, `workspace.getConfiguration/onDidChangeConfiguration`, `workspace.openTextDocument/applyEdit`, `workspace.onDidSaveTextDocument/onDidChangeTextDocument/onDidOpenTextDocument/onDidCloseTextDocument`, `workspace.findFiles`, `workspace.asRelativePath` · `languages.registerCompletionItemProvider/HoverProvider/SignatureHelpProvider/CodeActionProvider/DefinitionProvider/ReferenceProvider/DocumentFormattingProvider/DocumentSymbolProvider/SemanticTokensProvider/createDiagnosticCollection/registerDocumentLinkProvider` · `scm.createSourceControl`, `tasks.registerTaskProvider`, `debug.registerDebugAdapterDescriptorFactory` (DAP-lite), `env.appName/uriScheme/language`, `extensions.getExtension/all`, `secrets.get/store/delete` (scoped), `Uri`, `Range`, `Position`, `Selection`, `EventEmitter`, `Disposable`, `ThemeColor`, `ThemeIcon`, `TreeItem`, `TreeDataProvider`, `CancellationTokenSource`, `ProgressLocation`, `QuickPickItem`, `StatusBarAlignment`, `l10n.t`.
**Explicitly unavailable (typed error + docs entry):** `child_process`, `fs` (Node), `os`, `net`, `http`, `WebSocket` (raw), `webview` panels that load remote content, `commands.registerTerminalProfileProvider` (local shells), anything notebook-related, `authentication` providers that require native flows on-device (system-browser flow only), `env.clipboard` without the clipboard permission.

### 16.4 Command registry & when-clause grammar
```ts
interface Command { id: string; title: string; category?: string; icon?: string; when?: WhenClause;
  args?: JSONSchema; source: 'builtin' | 'extension' | 'agent' | 'user'; run(...args: unknown[]): Promise<unknown> }
```
When-clause grammar (v1): identifiers referencing context keys (`editorFocus`, `editorHasSelection`, `editorLangId`, `resourceScheme`, `fileIsDirty`, `inAgentRun`, `sessionMode`, `agentAwaitingApproval`, `gitRepoPresent`, `terminalActive`, `browserActive`, `debugActive`, `trustedWorkspace`, `hardwareKeyboard`, `breakpoint`, `platform`, `offlineMode`), operators `== != =~ && || ! ( )`, string/number/boolean literals, and `in` against array keys. Implemented as a tiny parser + evaluator with 30+ unit tests; unknown keys evaluate to `undefined` (falsy) and emit a dev-only warning so typos are caught in tests, not in production.

### 16.5 Telemetry event schema (schema-validated; opt-in)
```ts
interface TelemetryEvent { name: TelemetryEventName; ts: number; appVersion: string; build: number;
  platform: 'ios' | 'android'; deviceClass: 'low' | 'mid' | 'high';         // no device ids
  props: Record<string, string | number | boolean>;                        // allowlisted per event name
  sessionHash: string;                                                     // rotating, non-identifying
}
```
Allowlisted names (v1): `app_launch`, `screen_view`, `perf_cold_start`, `perf_typing_latency`, `perf_scroll_jank`, `perf_index_duration`, `file_open`, `search_performed`, `replace_applied`, `git_commit`, `git_push`, `agent_session_started`, `agent_mode_changed`, `agent_plan_created`, `agent_plan_approved`, `agent_tool_called`, `agent_tool_denied`, `agent_step_failed`, `agent_session_completed`, `agent_budget_paused`, `diff_applied`, `artifact_reviewed`, `browser_verification_completed`, `browser_blocked`, `provider_test_connection`, `provider_error`, `model_switched`, `fallback_triggered`, `extension_installed`, `extension_disabled_crash`, `mcp_server_added`, `mcp_tool_called`, `permission_prompt_shown`, `permission_answered`, `offline_mode_toggled`, `crash`, `anr`, `host_crash`. **Never** in props: file paths (beyond `‹project›/relative`), file contents, prompts, completions, model responses, key material, email addresses, device identifiers.

### 16.6 Environment & configuration surface
| Key | Kind | Default | Notes |
|---|---|---|---|
| `mayank-ide.editor.fontSize` | number | 13 | 10–22, pinch-adjustable |
| `mayank-ide.editor.tabSize` / `insertSpaces` | number/bool | 2 / true | Overridable per language, respects `.editorconfig` |
| `mayank-ide.editor.wordWrap` | 'off'\|'on'\|'wordWrapColumn' | 'off' | |
| `mayank-ide.editor.ghostText` | bool | false | Requires a completion model or local provider |
| `mayank-ide.agent.defaultMode` | enum | 'plan' | First-run default |
| `mayank-ide.agent.approvalPolicy` | enum | 'always-ask' | 'always-ask' \| 'destructive-only' \| 'auto-apply-safe' |
| `mayank-ide.agent.contextBudgetTokens` | number | 120000 | Capped by model context |
| `mayank-ide.agent.maxSteps` | number | 60 | Loop guard |
| `mayank-ide.agent.sessionBudgetUSD` | number | 0 (unlimited) | 0 disables the cap |
| `mayank-ide.agent.backgroundRuns` | bool | true | Foreground service / BGTask |
| `mayank-ide.browser.enabled` | bool | true | Master switch for browser tools |
| `mayank-ide.browser.recording` | bool | true | Verification runs always record |
| `mayank-ide.browser.allowlist` / `denylist` | string[] | [] | Host/path patterns |
| `mayank-ide.git.autoPush` | bool | false | |
| `mayank-ide.git.identity` | {name,email} | empty | Required to commit; prompted on first commit |
| `mayank-ide.security.biometricGate` | bool | true | For reveal/copy/destructive ops |
| `mayank-ide.security.appLock` | 'off'\|'immediate'\|'1m'\|'5m' | '1m' | |
| `mayank-ide.security.redactionRules` | string[] | defaults | Extra regexes |
| `mayank-ide.telemetry.enabled` | bool | false | Opt-in |
| `mayank-ide.offlineMode` | bool | false | Hard-block network except allowlisted endpoints |
| `mayank-ide.extensions.allowDiskWrites` | bool | false | Extensions cannot write behind the editor by default |
| `mayank-ide.checkpoints.retention` | number | 20 | Ring buffer |
| `mayank-ide.index.excludes` | string[] | [] | Plus `.gitignore` / `.mayank-ideignore` |

### 16.7 Environment variables / build-time config (CI + local dev, never secret values in the repo)
`EXPO_PUBLIC_APP_ENV` (`dev`|`beta`|`prod`) · `MAYANK_IDE_FAKE_PROVIDER=1` (agent flows with a deterministic local fake provider — required for E2E) · `MAYANK_IDE_PERF_REPORT_PATH` (budget output) · `MAYANK_IDE_POLICY_FILE` (enterprise policy override for tests) · `SENTRY_DSN` (**optional**, only if crash reporting is enabled; injected at build time, never committed) · `EAS_PROJECT_ID`. Real secrets exist only in CI secret stores and in the keychain at runtime.

## 17. APPENDIX A — GESTURE, KEYBOARD & COMMAND MAPS

### 17.1 Gesture map (final, as implemented in §4.6 and §4.8)
| Context | Gesture | Action | Disable-able |
|---|---|---|---|
| Editor | Two-finger swipe ← / → | Undo / Redo | ✔ |
| Editor | Two-finger tap | Toggle comment | ✔ |
| Editor | Two-finger drag (vertical) | Scroll without moving caret | ✔ |
| Editor | Three-finger tap | Command palette | ✔ |
| Editor | Three-finger swipe ↓ | Dismiss keyboard | ✔ |
| Editor | Pinch | Font size (transient) | ✔ |
| Editor | Double / triple / quad tap | Word / line / enclosing block selection | ✖ (core editing) |
| Editor | Two-finger tap inside selection | Extend to matching bracket | ✔ |
| Editor | Long-press symbol | Hover info card | ✖ |
| Editor | Long-press gutter | Line actions (select/copy/cut/mark) | ✔ |
| Editor | Drag selection handle | Adjust selection with loupe | ✖ |
| Cursor wheel | Drag / long-press / two-finger drag | Char / mode switch / accelerate | ✖ |
| Global | Right-edge swipe ← | Open Agent HUD | ✔ |
| Global | Left-edge swipe → | Open side bar view | ✔ |
| Global | Swipe up from status bar | Open Agent HUD (context bar) | ✔ |
| Tab bar | Drag tab | Reorder (haptic snap) | ✖ |
| Tab bar | Swipe tab ↑ | Close tab (with undo snackbar) | ✔ |
| Tab bar | Long-press tab | Tab context menu | ✖ |
| Lists | Swipe left / right | Primary / destructive row action | ✖ |
| Lists | Pull down | Refresh / re-sync | ✖ |
| Sheets | Drag handle / swipe down | Change snap point / dismiss | ✖ |
| Diff view | Swipe → / ← | Next / previous hunk | ✔ |
| Diff view | Long-press line | Comment for the agent | ✖ |
| Browser | Long-press element | Inspect element → snapshot snippet | ✖ |

### 17.2 Hardware-keyboard shortcut map (bluetooth keyboards; verified on Tier E)
Built-in (`keybindings.json`-overridable): `⌘K` Quick Open · `⌘⇧P` Command palette · `⌘P` Quick Open · `⌘S` Save · `⌘⇧S` Save All · `⌘W` Close tab · `⌘⇧T` Reopen closed tab · `⌘⇧A` All open tabs · `⌘F` Find · `⌘⌥F` Replace · `⌘⇧F` Find in files · `⌘Z` / `⌘⇧Z` Undo / Redo · `⌘D` Add next occurrence · `⌘/` Toggle comment · `⌥↑/↓` Move line · `⇧⌥↑/↓` Copy line · `⌘⏎` Run current task · `⌘B` Toggle sidebar · `⌘J` Toggle bottom panel · `⌘\` Split editor · `` ⌘` `` Terminal · `⌘⇧G` Source control · `⌘⇧X` Extensions · `⌘⇧E` Explorer · `⌘⇧I` Agent HUD · `⌘⇧K` Start agent on selection · `⌘.` Quick fix · `⌥⌘→/←` Next/previous tab · `⌃-` / `⌃⇧-` Cursor back/forward · `Esc` Dismiss topmost layer · `Tab` Accept ghost text / indent · `⌘⇧B` Run build task · `⇧F10` (Android) Browser tool toggle. On-screen equivalents exist for **every** shortcut — the app is fully usable without a keyboard.

### 17.3 Complete command catalogue (v1, minimum viable set)
Editor: `editor.action.formatDocument`, `editor.action.commentLine`, `editor.action.indentLines`, `editor.action.duplicateLine`, `editor.action.moveLineUp/Down`, `editor.action.addCursors`, `editor.action.removeAllCursors`, `cursor.history.back/forward`, `editor.action.codeAction`, `editor.action.rename`, `editor.action.organizeImports`, `editor.action.insertSnippet`, `emmet.expandAbbreviation`, `editor.action.wordWrap.toggle`, `editor.action.minimap.toggle`, `editor.action.largeFileMode`.
Navigation: `workbench.action.quickOpen`, `workbench.action.showCommands`, `workbench.action.gotoSymbol`, `workbench.action.gotoLine`, `workbench.action.gotoDefinition`, `workbench.action.findReferences`, `workbench.action.openProblems`, `workbench.action.nextDiagnostic`.
Tabs/layout: `workbench.action.closeTab`, `closeOthers`, `closeAll`, `reopenClosed`, `showAllTabs`, `pinTab`, `splitEditor`, `toggleSidebar`, `togglePanel`, `togglePreview`.
Files: `file.new`, `file.save`, `file.saveAll`, `file.saveAs`, `file.rename`, `file.delete`, `file.move`, `file.duplicate`, `file.copyPath`, `explorer.importFolder`, `project.addRoot`, `project.trust`.
Search: `search.find`, `search.replace`, `search.findInFiles`, `search.replaceInFiles`, `search.codesearch`.
SCM: `git.commit`, `git.commitAndPush`, `git.push`, `git.pull`, `git.fetch`, `git.createBranch`, `git.switchBranch`, `git.stash`, `git.stashPop`, `git.discardChanges`, `git.resolveConflict`, `git.createCheckpoint`, `git.revertCheckpoint`, `review.openChanges`.
Agent: `agent.newSession`, `agent.stop`, `agent.retry`, `agent.setMode.ask/plan/agent/goal`, `agent.selectModel`, `agent.attachContext`, `agent.openArtifacts`, `agent.openTaskGroups`, `agent.openAgentsSpace`, `agent.openPermissions`, `agent.openUsage`, `agent.toggleBrowserTools`, `agent.exportTranscript`, `agent.fork`, `agent.grillaMe`.
Providers: `provider.add`, `provider.test`, `provider.fetchModels`, `provider.setDefault`, `provider.remove`, `provider.toggleOfflineMode`.
Extensions/MCP: `extensions.install`, `extensions.installFromFile`, `extensions.disable`, `extensions.reloadHost`, `extensions.openSettings`, `mcp.addServer`, `mcp.testServer`, `mcp.managePolicies`.
Terminal/tasks: `terminal.newSession`, `terminal.selectTarget`, `terminal.clear`, `terminal.sendToAgent`, `tasks.runTask`, `tasks.rerunLast`, `debug.startClient`, `debug.stepOver`, `http.sendRequest`.
System: `system.openSettings`, `system.openSettingsJson`, `system.openKeybindings`, `system.exportSettings`, `system.copyDiagnostics`, `system.clearData`, `system.showStorage`, `system.reportIssue`, `system.showOnboarding`.

## 17. APPENDIX B — ACCEPTANCE SCENARIO & GLOSSARY

### 17.4 The golden acceptance scenario (must pass end-to-end before "shipped")
Performed on a **Tier A** device with **no laptop**, in one continuous session, with the app backgrounded at least twice:
1. Install and launch. Onboarding teaches the three core gestures and the agent modes. Cold start to editable in < 2.5 s.
2. Create a project from a GitHub URL using device-flow OAuth; repo A (small, ~200 files) clones via the fast path.
3. Add an API key for one provider (paste → format check → biometric reveal → Test Connection → Fetch Models → set default). Verify nothing about the key appears in logs or exported diagnostics.
4. Open a file; use the symbol rail, cursor wheel, multi-cursor, a snippet, and a ghost-text accept. Undo everything. Frame rate stays at 60 fps.
5. Ask the agent: "Add retry with exponential backoff to the API client and cover it with a test." In **Plan** mode it produces an Implementation Plan artifact and a Task List. Review it, leave one inline comment, request a change — the agent updates and versions the artifact.
6. Approve → the session switches to Agent mode and edits files behind the permission engine. A `run_command` request appears as a prompt card → **Deny** once and confirm the agent adapts; then **Allow for session** for the test command.
7. The agent runs the test task on the remote target and — because the change touches UI — uses the browser tool to verify, producing a **screenshot artifact** and a short **recording**. The task becomes `done` only with evidence attached.
8. Open Review Changes: accept 3 hunks, reject 1, leave a line comment for the agent, then Apply. The file state matches the accepted hunks exactly and a checkpoint exists.
9. Background the app mid-run and return: the session resumes from the last completed tool call with no side-effecting tool blindly re-executed.
10. Revert to the pre-agent checkpoint: the workspace returns byte-identically (verified with `git status` and file hashes), and the revert itself is revertible.
11. Commit with a message and push to a new branch (through an approval card). Then go offline and confirm editing, search, git status, and installed extensions still work with a clear offline banner.
12. Install an extension from the marketplace, run its command, then force a crash: it auto-disables with a banner while the editor and agent remain unaffected.
13. Add an MCP server over HTTP, gate one of its tools to `ask`, call it from the agent, and confirm the audit log records the decision and redacted arguments.
14. Export a diagnostics bundle, preview it, and verify it contains no secrets, no file contents, and no prompts.
**Fail conditions:** any silent failure · any infinite spinner · any destructive action without approval · any secret in logs/diagnostics · any success claim without verification evidence · any crash or ANR.

### 17.5 Glossary
**Agent** — the multi-step reasoning system (model + tools + artifacts + knowledge) that reasons over the project and communicates through tasks and artifacts. **Agents Space (Agent Manager)** — the multi-session dashboard showing what runs, what needs review, and what it cost. **Artifact** — a structured deliverable (implementation plan, task list, walkthrough, diff, diagram, screenshot, recording, note) enabling asynchronous review and steering. **Checkpoint** — a restorable snapshot (git ref or VFS patch set) created before risky operations. **Context pill** — a removable attachment of context (selection, file, diff, terminal range, artifact, image, URL, MCP resource) to a turn. **DiffApplyPlan** — the multi-file proposed change with per-hunk decisions, shared by the agent, SCM and Review Changes. **Extension Host** — the sandboxed Web Worker where an extension runs, behind a `vscode`-shaped API. **Hosts** — our WebView/Worker sandboxes (Editor, Language, Index, Terminal, Browser, Extension) with versioned bridges. **LSP tier** — A (built-in worker services), B (remote LSP over WebSocket), C (index-based fallback). **MCP** — Model Context Protocol; on-device we support HTTP/SSE transports and an optional desktop relay for stdio servers. **Permission engine** — the Deny/Ask/Allow evaluator with wildcard, prefix, regex and implicit rules that gates every tool call. **Provider adapter** — a provider-specific implementation of `ProviderAdapter`. **Restricted mode** — untrusted-workspace state where agent writes, task execution, extensions and MCP are disabled. **Rules / Skills / Workflows / Subagents / Hooks** — declarative agent customization stored under `.mayank-ide/`. **Task Group** — the per-turn grouping of `AgentTask`s with statuses, artifacts and files touched. **VFS** — the provider-agnostic virtual filesystem (`provider://<rootId>/<path>`). **Trust gate** — the first-open decision that enables or restricts agentic capabilities for a workspace.

### 17.6 Reference links (verify before citing anything in user-facing copy)
- **Google Antigravity docs** (the vocabulary we mirror: agent, permissions, artifacts, browser, task groups, agent side panel, slash commands): `https://antigravity.google/docs`.
- **VS Code Extension API** (contribution points and activation events; we implement a documented subset): `https://code.visualstudio.com/api/references/contribution-points`, `https://code.visualstudio.com/api/references/activation-events`, `https://code.visualstudio.com/api/references/extension-manifest`.
- **Language Server Protocol 3.17**: `https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/`.
- **Debug Adapter Protocol**: `https://microsoft.github.io/debug-adapter-protocol/`.
- **Model Context Protocol**: `https://modelcontextprotocol.io/`.
- **CodeMirror 6 & Lezer**: `https://codemirror.net/docs/`, `https://lezer.codemirror.net/`.
- **Open VSX registry API**: `https://open-vsx.org/api` (wiki: `https://github.com/eclipse/openvsx/wiki`).
- **xterm.js**: `https://xtermjs.org/` · **web-tree-sitter**: `https://tree-sitter.github.io/tree-sitter/`.
- **Reanimated 3**: `https://docs.swmansion.com/react-native-reanimated/` · **Gesture Handler**: `https://docs.swmansion.com/react-native-gesture-handler/`.
- **Expo modules** used here (router, file-system, sqlite, secure-store, local-authentication, haptics, notifications, background-task, sharing, document-picker, updates, dev-client): `https://docs.expo.dev/versions/latest/`.
- **isomorphic-git**: `https://isomorphic-git.org/` — read the "API limits" section before relying on any capability.
- **Maestro**: `https://maestro.mobile.dev/` · **Detox**: `https://wix.github.io/Detox/`.
- **Rule:** verify every pinned dependency with `npm view <pkg> version` at implementation time and record the version in the ADR that introduces it. If a documented capability differs from reality, capture the difference in `/docs/gotchas.md` and in the ADR.

### 17.7 Prompt changelog
**v2.0 (this document)** — full rewrite and expansion of v1:
- **§0** builder operating rules, Definition of Done, reporting format, stop-and-ask protocol, forbidden anti-patterns, precedence order, assumptions ledger, end deliverables.
- **§1** north star; Antigravity parity map (agent, Agent Manager, side panel, task groups, artifacts, planning mode, permissions engine, browser tool + recordings + allow/deny + isolated profile, Review Changes, tab completion, Vim, slash commands, MCP/skills/hooks, credits, projects, workspace trust); VS Code parity map; mobile reality constraints; personas; metrics; non-goals.
- **§2** pinned stack with rationale and hard rejections; architecture boundaries enforced in CI; device matrix.
- **§3** process/thread model; repository layout; six-host bridge protocol envelope; state ownership matrix; error taxonomy.
- **§4** responsive shell topologies; rail and side-bar views (explorer, search, SCM, console); header/tabs/minimap/status bar; agent HUD with snap points and resume semantics; command palette with modes and a real command registry; the full touch-editing layer (cursor wheel, loupe, keyboard companion toolbar, multi-cursor, gesture vocabulary table); snippets/Emmet/smart paste/ghost text/Vim; motion and haptics; performance and battery budgets with measurement methods.
- **§5** editor engine decision; complete Editor Host bridge API; editor feature set; large-file safe mode; diff/review editor shared with SCM and agent; three language-intelligence tiers; mobile completion/hover/navigation UX; diagnostics pipeline.
- **§6** VFS interface and providers; project model; workspace trust; indexing, search, semantic search and the replace engine; git adapter with honest limits and a fast-clone strategy; source-control UX.
- **§7** terminal targets and PTY protocol; tasks and problem matchers; debug-lite declared scope; test-runner parsing.
- **§8** `ProviderAdapter` contract; adapter list; routing, fallback and cost guards; usage ledger; the complete Providers UX (key entry, test connection, model discovery, custom endpoint builder, removal).
- **§9** agent session model; four modes with contractual semantics; resumable loop; **Antigravity-style permission engine** (actions, rules, implicit rules, defaults, prompt card with scope editing, audit log); checkpoints and Review Changes; Agents Space; Task Groups; slash commands; tool registry and catalogue; context-builder rules; rules/skills/workflows/subagents/hooks; prompt library.
- **§10** artifact model and the review/steering loop; preview system; **browser tool** with snapshot/act/record, two-layer URL security, isolated profile and the verification-loop requirements.
- **§11** the **fully specified extension system** (manifest, supported contribution points, activation events, worker host, permission and trust model, size caps, failure isolation, offline behaviour, Open VSX marketplace and install pipeline, enterprise policy) plus the MCP client with mobile-safe transports and prompt-injection defenses.
- **§12** secret hierarchy; transport and data handling; 12-row threat model with matching tests; redaction pipeline; privacy, compliance and enterprise controls.
- **§13** design tokens and component inventory; settings information architecture; accessibility requirements; i18n; the full testing strategy (unit → contract → component → integration → E2E → perf → security → a11y → golden sessions); telemetry schema; release/channel/rollback process.
- **§14** milestone roadmap M0–M12 with DoD and demos; sequencing and critical path; risk register; staffing tracks.
- **§15** builder working protocol: first ten actions, slice workflow, plan and ADR templates, git conventions, self-review checklist, honesty rules, handoff kit.
- **§16** frozen data contracts; storage-key registry; extension API surface; when-clause grammar; telemetry event schema; settings keys; environment variables.
- **§17** gesture, shortcut and command maps; the golden acceptance scenario; glossary; references; this changelog.

**v1.0** — original prompt: objective, tech-stack list, Phase 1 UI/UX outline (shell, palette, touch layer, motion, budgets), Phase 2/3 placeholders, Phase 4 implementation steps. Preserved verbatim at `masterprompt.v1-backup.md`; every v1 requirement survives in v2.0 in expanded, testable form.

---

*End of master prompt. When a slice teaches you something this document does not yet say, update the document in the same PR — a spec that lies is worse than no spec at all.*

