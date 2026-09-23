# PRD: Mayank IDE — AI-Native Mobile Code Editor & Coding Agent

## 1. Overview

**Product Name:** Mayank IDE (working title)
**Type:** Mobile Application (iOS & Android)
**Category:** Developer Tools / Code Editor / AI Assistant
**Version:** 0.1.0 (MVP)

### 1.1 Purpose
A mobile-first code editor with a built-in AI coding agent that supports multiple LLM providers via user-supplied API keys and custom endpoints. Think "Cursor or VS Code + Copilot, but native on mobile, with a pluggable AI backend."

### 1.2 Problem Statement
Mobile developers and on-the-go programmers lack a true code editor with deep AI agent capabilities. Existing mobile editors (Textastic, Koder, etc.) offer syntax highlighting but no agentic AI. Existing AI coding apps (v0, Bolt) run in browsers and don't provide a real editor. Users want:
- A proper code editor on their phone/tablet
- An AI agent that can read, write, refactor, and explain code
- Freedom to choose their own AI provider (OpenAI, Anthropic, Google, Groq, Ollama, etc.)
- Full control over API keys and costs

### 1.3 Goals
| Goal | Description |
|------|-------------|
| G1 | Deliver a mobile code editor with syntax highlighting, intellisense, and file tree |
| G2 | Integrate an AI coding agent that can edit files, run commands, and answer questions |
| G3 | Support 5+ AI providers via user-supplied API keys |
| G4 | Allow custom endpoints (OpenAI-compatible, Ollama, vLLM, etc.) |
| G5 | Store all secrets in platform-native secure storage (Keychain/Keystore) |
| G6 | Zero telemetry on API keys; user data never leaves the device except to the chosen provider |

---

## 2. Target Audience

| Persona | Description |
|---------|-------------|
| **Solo Mobile Developer** | Needs to fix bugs or ship hotfixes from phone while away from laptop |
| **Student/Learner** | Learning to code, wants AI tutor + editor in one place |
| **DevOps/SRE** | Quick config edits, script writing, log analysis on the go |
| **Polyglot Hacker** | Uses multiple LLMs, compares outputs, self-hosts models |

---

## 3. Core Features (MVP)

### 3.1 Code Editor
| Feature | Details |
|---------|---------|
| Editor Engine | Monaco Editor (via WebView bridge) or CodeMirror 6 (native RN/Flutter) |
| Syntax Highlighting | 50+ languages via Tree-sitter or TextMate grammars |
| IntelliSense | Autocomplete, hover docs, go-to-definition (LSP-lite via WASM) |
| Multi-file Support | Tabbed editing, file tree sidebar, folder open |
| Themes | Dark/light, VS Code-compatible themes |
| Keybindings | External keyboard support, vim mode optional |
| Local Filesystem | Full access via Storage Access Framework (Android) / Document Picker (iOS) |

### 3.2 AI Coding Agent
| Feature | Details |
|---------|---------|
| Chat Panel | Side panel or bottom sheet for agent conversation |
| Agent Capabilities | Read file, write file, edit selection, explain code, generate code, refactor, debug |
| Context Awareness | Agent sees current file, selection, and project structure |
| Streaming | Token-by-token streaming responses |
| Tool Use | Agent can propose file edits; user approves before apply |
| Multi-turn | Conversation history per session; optional persistence |

### 3.3 Provider Management
| Feature | Details |
|---------|---------|
| Built-in Providers | OpenAI, Anthropic, Google Gemini, Groq, Mistral, Cohere |
| Custom Endpoint | User adds any OpenAI-compatible URL (Ollama, LM Studio, vLLM, etc.) |
| API Key Storage | Each provider has its own key, stored in OS keystore |
| Model Selection | User picks model per provider (gpt-4o, claude-3.5-sonnet, gemini-1.5-pro, etc.) |
| Default Provider | User sets preferred default; can switch per chat |
| Cost Estimation | Show estimated tokens/cost per request (optional) |

### 3.4 Custom Endpoint System
| Field | Description |
|-------|-------------|
| Endpoint Name | User-defined label (e.g., "My Ollama", "Local vLLM") |
| Base URL | `http://192.168.1.50:11434/v1` or `https://api.myprovider.com` |
| API Key | Optional (some local servers need none) |
| API Type | OpenAI-compatible / Anthropic-compatible / Custom |
| Model List | Auto-fetch from `/models` or manual entry |
| Headers | Custom HTTP headers (for auth proxies, etc.) |
| Test Button | Ping endpoint to verify connectivity |

---

## 4. User Stories

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As a user, I want to open a folder from my device and edit files with syntax highlighting | P0 |
| US-02 | As a user, I want to chat with an AI agent about my code and get streaming responses | P0 |
| US-03 | As a user, I want to add my OpenAI API key and select GPT-4o for coding tasks | P0 |
| US-04 | As a user, I want to add a custom endpoint pointing to my local Ollama server | P1 |
| US-05 | As a user, I want the agent to read my current file and suggest edits inline | P1 |
| US-06 | As a user, I want to approve or reject each file change the agent proposes | P1 |
| US-07 | As a user, I want my API keys stored securely and never uploaded anywhere | P0 |
| US-08 | As a user, I want to switch between providers mid-conversation | P2 |
| US-09 | As a user, I want to export my chat history and agent sessions | P2 |
| US-10 | As a user, I want vim keybindings for faster editing | P2 |

---

## 5. Technical Architecture

### 5.1 Platform & Framework
| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Framework | **React Native (Expo)** or **Flutter** | Cross-platform, hot reload, large ecosystem |
| Editor | **CodeMirror 6** (RN/Flutter wrapper) | Lightweight, extensible, mobile-friendly |
| AI Client | **Custom fetch layer** with streaming SSE | Full control over providers |
| Secure Storage | **react-native-keychain** / **flutter_secure_storage** | OS-level encryption |
| State | **Zustand** (RN) or **Riverpod** (Flutter) | Lightweight, persistent |
| Filesystem | **expo-file-system** / **path_provider** | Sandboxed + SAF |

### 5.2 Directory Structure (Example — React Native)

```
mayank-ide/
├── app/                    # Screens (Expo Router)
│   ├── (tabs)/
│   │   ├── editor/         # Main editor screen
│   │   ├── agent/          # Agent chat screen
│   │   └── settings/       # Settings & providers
│   └── _layout.tsx
├── components/
│   ├── editor/             # CodeMirror wrapper, file tree
│   ├── agent/              # Chat bubbles, tool call cards
│   └── ui/                 # Buttons, modals, etc.
├── lib/
│   ├── ai/                 # AI provider layer
│   │   ├── providers/
│   │   │   ├── openai.ts
│   │   │   ├── anthropic.ts
│   │   │   ├── google.ts
│   │   │   ├── groq.ts
│   │   │   └── custom.ts   # OpenAI-compatible base
│   │   ├── agent.ts        # Agent orchestration
│   │   ├── streaming.ts    # SSE parser
│   │   └── tools.ts        # File read/write tool definitions
│   ├── storage/            # Secure key storage
│   └── editor/             # Editor config, themes, LSP
├── hooks/
├── constants/
└── package.json
```

### 5.3 AI Provider Abstraction Layer

```typescript
interface AIProvider {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string | null;          // null for local
  headers?: Record<string, string>;
  models: AIModel[];
  chat(messages: Message[], opts: ChatOpts): AsyncIterable<Token>;
  listModels(): Promise<AIModel[]>;
  testConnection(): Promise<boolean>;
}

// All providers implement this; custom endpoint uses OpenAI-compatible adapter
```

---

## 6. Security & Privacy

| Requirement | Implementation |
|-------------|---------------|
| API keys never in plaintext | Store in iOS Keychain / Android Keystore |
| Keys never logged | Sanitize all fetch logs; mask key in UI (••••••) |
| No analytics on code | Opt-in only; no code sent to app servers |
| Local-first | All files stay on device; agent calls go directly to user's chosen provider |
| Network | HTTPS enforced; allow HTTP for local endpoints (user opt-in, with warning) |
| App lock | Biometric lock (FaceID/TouchID) optional |

---

## 7. UI/UX Wireframes (Text Description)

### Editor Screen
- Left: collapsible file tree (tap hamburger to toggle)
- Center: code editor with line numbers, current file tab at top
- Bottom: agent toggle (floating button or bottom sheet handle)
- Right: agent chat panel (slides in from right edge on tablet, bottom sheet on phone)

### Agent Chat
- Message bubbles with role (user/assistant/tool)
- Tool call cards: "📖 Read file: App.tsx" → expandable
- Streaming text with cursor
- Quick actions: "Explain", "Fix", "Refactor", "Add comments" (contextual toolbar above keyboard)
- Provider/model picker in header (tap to switch)

### Settings → Providers
- List of configured providers with status indicator (green = tested, red = failed)
- "+ Add Provider" button → picker: OpenAI / Anthropic / Google / Groq / Custom
- Custom form: name, URL, key, headers, model list
- Test connection button per provider
- Delete/reorder providers

---

## 8. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | Editor opens files <100ms; agent first token <2s on fast connection |
| Offline | Editor works fully offline; agent requires network (or local endpoint) |
| Accessibility | VoiceOver/TalkBack support; dynamic font sizes |
| Localization | English first; i18n-ready architecture |
| Battery | Efficient; no background polling; SSE streams close on app background |

---

## 9. Future Enhancements (Post-MVP)

- [ ] Terminal emulator (WebView + websocket to local server or remote)
- [ ] Git integration (clone, commit, push from mobile)
- [ ] MCP (Model Context Protocol) client support
- [ ] Collaborative editing (Yjs/CRDT)
- [ ] Plugin system (user scripts)
- [ ] iPad/Android tablet split-screen optimization
- [ ] Apple Pencil / stylus support for diagrams
- [ ] Voice input for agent prompts

---

## 10. Success Metrics

| Metric | Target (3 months post-launch) |
|--------|-------------------------------|
| Downloads | 5,000+ |
| Weekly Active Users | 1,000+ |
| Avg Session Duration | >10 minutes |
| Agent Requests/User/Day | 15+ |
| Crash-free Sessions | >99% |
| 5-Star Reviews | >60% |

---

## 11. Open Questions

1. Should we support iPad/tablet as a separate layout from day 1?
2. Do we need a freemium tier with our own hosted model, or 100% BYO-key?
3. Should the agent be able to run shell commands (restricted sandbox)?
4. What's the minimum iOS/Android version?

---

*Document version: 1.1.0 — Last updated: 2026-09-21*
*Author: Mayank AI Product Team*
