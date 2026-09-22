# MAYANK-MOBILE-CODE-IDE — CodeForge Mobile

A mobile app (iOS + Android) code editor with a built-in AI coding agent. Users add their own API keys (OpenAI, Google, Anthropic, Groq, …) and can register **custom endpoints** for any other provider (Ollama, LM Studio, vLLM, etc.). Keys are stored in the OS keychain and are only ever sent to the provider you configured.

## 📚 Project documents

| File | Purpose |
|------|---------|
| [`PRD.md`](./PRD.md) | Product requirements: features, user stories, architecture, security, roadmap |
| [`agent.md`](./agent.md) | Behavior spec for the in-app AI agent: tools, safety boundaries, protocols |
| [`master_prompt.md`](./master_prompt.md) | Step-by-step build plan (Phases 1–6) for AI-assisted development |

## 📱 The app

Lives in [`CodeForgeMobile/`](./CodeForgeMobile) — React Native + Expo (SDK 57), Expo Router, CodeMirror 6, Zustand.

```bash
cd CodeForgeMobile
npm install
npx expo start            # dev server (Expo Go / dev build)
npx expo run:android      # native Android
npx expo run:ios          # native iOS (macOS)
npm run web               # browser preview
npm run typecheck         # tsc --noEmit (strict)
npm test                  # 7 logic suites · 184 checks (SSE, tools, providers, export, settings, fuzzy, themes)
```

CI runs the same typecheck + test commands on every push/PR:
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

### Build status

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Editor core: file tree, tabs, CodeMirror (dark/light, vim, font size), SAF folder access (Android), sandbox/demo projects, save + auto-save | ✅ Done |
| 2 | AI provider layer: OpenAI / Anthropic / Gemini / Groq / custom endpoints, SSE streaming (XHR-incremental), keychain storage, provider registry, presets | ✅ Done |
| 3 | Agent chat: streaming markdown UI, tool-call parsing, read-only auto-tools, write/edit diff previews with Approve/Reject, context injection, cancel, turn cap | ✅ Done |
| 4 | Provider management UI: add/edit/test/delete/default, keychain key entry, model fetch, custom endpoints | ✅ Done (core) |
| 5 | Editor ↔ agent bridge (Send to Agent, file links in chat, reveal applied edits), Retry on errors, key-missing guidance, session tokens, transport-level tests | ✅ Done |
| 6 | EAS build config (`eas.json`, bundle IDs), privacy policy, store assets | 🔶 Config done (builds not run here) |

### Hardening ✚

- **Extension system v1 (Phase 2)** — marketplace-style **Extensions tab**
  (🧩): search, INSTALLED / FEATURED sections, install-uninstall-enable
  flow. Ships 4 VS Code theme extensions (Dracula, Monokai, GitHub Light,
  Tokyo Night) converted on the fly by the theme engine
  (`src/lib/extensions/themes.ts`): VS Code `.json` tokenColors/colors →
  CodeMirror `HighlightStyle` + editor chrome, applied to BOTH editor builds
  (native WebView via a serializable theme spec over the bridge, web via
  direct extensions). Tag-expression resolver in `tagScope.ts`
  (`function(variableName)` → Lezer tags), test-covered.
- **Markdown split preview (Phase 1.1)** — eye button on `.md` files toggles
  a live preview pane (side-by-side on wide screens, swap view on phones).
- **Tab reorder (Phase 1.1)** — long-press any tab → Move Left/Right/Close
  action sheet (projectStore `moveTab`).
- **Biometric key gate (PRD 3.2)** — Settings → Security → _Biometric API
  Keys_: keys saved afterwards require Face ID / fingerprint / passcode on
  every keychain read (`react-native-keychain` access control).
- **Command palette / quick open (Phase 1.2)** — header 🔍 button or
  `Ctrl/Cmd+P` (web) opens fuzzy quick-open over all project files;
  `>` switches to command mode (`Ctrl/Cmd+Shift+P`): save, close, send to
  agent, toggle tree/theme/word-wrap, new chat, settings. Enter picks the
  top match; custom subsequence scorer in `src/lib/search/fuzzy.ts`
  (consecutive + word/camelCase boundary bonuses), fully tested.
- **Breadcrumbs bar** — full path of the active file (`src › components ›
  App.tsx`) between tabs and editor, VS Code-style.
- **Status-bar model pill** — tap-to-agent `✦ Provider · model` pill next
  to language in the VS Code-style status bar.
- **Haptics (Phase 1.3)** — light taps on file/tab/palette picks, medium on
  send-to-agent, success buzz on saves (iOS/Android, no-op on web).

- **VS Code-style settings** — schema-driven (`src/lib/settings/schema.ts`),
  searchable settings screen with dot-namespaced ids (`editor.fontSize`,
  `files.autoSave`…), modified-state accent bars, dropdown/stepper/switch
  controls, and "N Settings Found" result counts.
- **Editor extensions & switches** (CodeMirror 6, both native WebView and web
  builds): tab size (2/4/8 indent unit), word wrap, line-number gutter,
  autocomplete, active-line + selection-match highlight, bracket matching &
  auto-close, visible whitespace/trailing whitespace, and a top-pinned
  find/replace panel (Ctrl/Cmd+F).
- **Status bar (VS Code-style)** — `Ln X, Col Y`, `Spaces: n`, Wrap, VIM and
  the file language shown at the bottom of the editor; cursor position is
  streamed from CodeMirror on both native and web builds.
- **Session persistence** — the Forge chat survives app restarts (last 80
  messages in AsyncStorage); in-flight tool requests degrade to a "session
  restored" failure instead of a phantom running state, and truncated streams
  are marked cancelled.
- **Chat export (US-09)** — header share button copies the whole session as
  Markdown (model/project/timestamp header, per-turn headings, tool-call
  summaries with applied/rejected/failed outcomes) to the clipboard.
- **Copyable code fences** — every fenced block in the assistant stream renders
  with a language label + one-tap Copy button (and selectable text).
- **In-repo test suites** — `tests/*.test.ts` covers SSE parsing for all
  provider families, auth/error key-leak sanitization, tool extraction + apply
  logic, settings schema/search/coercion, and session export; run with
  `npm test`.

### Native builds (Phase 6)

```bash
cd CodeForgeMobile
# Dev client with react-native-keychain support (required — Expo Go can't run keychain):
npx eas build --profile development --platform android
npx eas build --profile development --platform ios
# Internal preview APK:
npx eas build --profile preview --platform android
```

Requires an Expo/EAS account (`npx eas login`). Config lives in `eas.json`;
privacy policy in `CodeForgeMobile/PRIVACY.md`.

### Manual E2E checklist (device)

- [ ] Add OpenAI key → Test → chat → streaming replies
- [ ] Add Anthropic / Google / Groq keys → chat works
- [ ] Add custom endpoint (`http://<lan-ip>:11434/v1` for Ollama) → chat works
- [ ] Agent reads file (tool card shows content)
- [ ] Agent proposes edit → diff shown → **Approve** → file changed + editor reveals changed line
- [ ] Agent proposes edit → **Reject** → file untouched, agent adapts
- [ ] Chat survives app kill/relaunch (tool cards show restored state)
- [ ] Header share button → paste elsewhere → session markdown complete
- [ ] Copy button on a code fence → clipboard matches
- [ ] Switch provider mid-chat via header picker
- [ ] Delete provider → key removed from keychain
- [ ] App backgrounded mid-stream → stops cleanly
- [ ] Offline → editor works; agent surfaces a network error with Retry

## 🔐 Security model (non-negotiable)

- API keys only in iOS Keychain / Android Keystore — never in AsyncStorage, never logged.
- Keys are transmitted only to the provider endpoint you configured.
- File access is sandboxed to the folder you explicitly open.
- Agent file edits always require explicit approval (diff + Approve/Reject).
- Chat history persists locally (AsyncStorage, on-device only); clear it via
  Settings → Reset app data. Keys are excluded from every persisted payload.
