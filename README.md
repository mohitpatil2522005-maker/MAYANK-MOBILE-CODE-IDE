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
npm test                  # 4 logic suites · 105 checks (SSE, tools, providers, export)
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
  logic, and session export; run with `npm test`.

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
