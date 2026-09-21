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
npx tsc --noEmit          # typecheck
```

### Build status

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Editor core: file tree, tabs, CodeMirror (dark/light, vim, font size), SAF folder access (Android), sandbox/demo projects, save + auto-save | ✅ Done |
| 2 | AI provider layer: OpenAI / Anthropic / Gemini / Groq / custom endpoints, SSE streaming (XHR-incremental), keychain storage, provider registry, presets | ✅ Done |
| 3 | Agent chat: streaming markdown UI, tool-call parsing, read-only auto-tools, write/edit diff previews with Approve/Reject, context injection, cancel, turn cap | ✅ Done |
| 4 | Provider management UI: add/edit/test/delete/default, keychain key entry, model fetch, custom endpoints | ✅ Done (core) |
| 5 | Editor ↔ agent bridge polish, quick-action context chips, per-chat provider switching UI | 🔶 Partial (model picker done) |
| 6 | EAS build & deploy | Planned |

## 🔐 Security model (non-negotiable)

- API keys only in iOS Keychain / Android Keystore — never in AsyncStorage, never logged.
- Keys are transmitted only to the provider endpoint you configured.
- File access is sandboxed to the folder you explicitly open.
- Agent file edits always require explicit approval (diff + Approve/Reject).
