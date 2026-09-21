# master_prompt.md — Master Prompt to Build CodeForge Mobile

> Copy this entire document into your AI coding assistant (Claude Code, Cursor, Windsurf, etc.) to scaffold and build the CodeForge Mobile app.

---

## 🎯 PROJECT GOAL

Build a cross-platform mobile application (iOS + Android) called **CodeForge Mobile**. It is a code editor with an integrated AI coding agent. Users bring their own API keys for OpenAI, Anthropic, Google, Groq, and any OpenAI-compatible custom endpoint (Ollama, LM Studio, vLLM, etc.). The app stores keys securely in the OS keystore and never sends them anywhere except the provider's API.

---

## 🏗️ TECH STACK DECISION

Use **React Native with Expo (SDK 52+)** for maximum velocity and cross-platform coverage.

Core dependencies:
- **Expo Router** — file-based navigation
- **CodeMirror 6** (`@uiw/react-codemirror`) — code editor
- **@codemirror/lang-*** packages — language support (js/ts, python, rust, go, etc.)
- **Zustand** — state management
- **react-native-keychain** — secure credential storage
- **expo-file-system** — file operations
- **expo-document-picker** — folder selection
- **@react-native-async-storage/async-storage** — non-sensitive settings
- **react-native-markdown-display** — render agent responses

---

## 📋 BUILD PHASES

### PHASE 1: Project Scaffold & Editor Core

1. Create Expo project: `npx create-expo-app@latest CodeForgeMobile --template tabs`
2. Install dependencies listed above
3. Set up Expo Router with three tabs: **Editor, Agent, Settings**
4. Build the Editor tab:
   - File tree component (reads from a selected project folder)
   - CodeMirror 6 wrapper with:
     - Syntax highlighting (start with TypeScript, JavaScript, Python, JSON)
     - Line numbers, gutter
     - Theme switching (dark/light)
     - Vim mode toggle
   - Tab bar for open files
   - Save file (Cmd+S / Ctrl+S or auto-save toggle)
5. File system integration:
   - Use `expo-document-picker` to let user pick a folder
   - Read/write files via `expo-file-system`
   - Persist last-opened folder and files in AsyncStorage

**Checkpoint:** User can open a folder, see files, open/edit/save files with syntax highlighting.

---

### PHASE 2: AI Provider Layer

1. Create `lib/ai/` module with this structure:

```
lib/ai/
├── types.ts          # AIProvider, AIModel, Message, Token interfaces
├── registry.ts       # Provider registry (CRUD for providers)
├── streaming.ts      # SSE parser for streaming responses
├── providers/
│   ├── base.ts       # Abstract base class
│   ├── openai.ts     # OpenAI implementation
│   ├── anthropic.ts  # Anthropic implementation
│   ├── google.ts     # Google Gemini implementation
│   ├── groq.ts       # Groq implementation
│   └── custom.ts     # OpenAI-compatible custom endpoint
└── agent.ts          # Agent orchestration logic
```

2. `types.ts` — define:

```typescript
export interface AIProvider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'google' | 'groq' | 'custom';
  baseURL: string;
  apiKey: string | null;
  customHeaders?: Record<string, string>;
  models: AIModel[];
  defaultModel?: string;
}

export interface AIModel {
  id: string;
  name: string;
  contextWindow: number;
  supportsStreaming: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
}
```

3. Implement each provider:
   - `openai.ts` — Chat Completions API with SSE streaming
   - `anthropic.ts` — Messages API with streaming
   - `google.ts` — Gemini API with streaming
   - `custom.ts` — OpenAI-compatible endpoint (same as OpenAI but configurable URL)
   - Each provider's `chat()` returns `AsyncIterable<Token>` for streaming

4. Secure storage for keys:
   - `lib/storage/keychain.ts` — wrap `react-native-keychain`
   - `setApiKey(providerId, key)` → Keychain
   - `getApiKey(providerId)` → Keychain
   - Keys are NEVER stored in AsyncStorage or app state; fetched on demand

5. Provider registry (AsyncStorage):
   - Stores provider configs (id, name, type, baseURL, customHeaders, models)
   - Does NOT store keys (those are in Keychain)
   - CRUD: addProvider, updateProvider, deleteProvider, listProviders, getDefaultProvider

**Checkpoint:** App can send a message to any configured provider and receive a streaming response.

---

### PHASE 3: Agent Chat UI & Tool System

1. Agent tab UI:
   - Chat message list (user bubbles right, assistant left)
   - Markdown rendering for assistant messages
   - Streaming text with typing indicator
   - Input bar with send button and model picker
   - Quick actions: "Explain selection", "Fix this", "Refactor"
2. Tool system:
   - Define tool schemas (read_file, write_file, edit_file, list_files, search_code)
   - When agent emits a tool call (parsed from streaming response):
     - Render a card: "🔧 Read file: src/App.tsx"
     - For read-only tools: auto-execute, show result inline
     - For write/edit: show diff preview + Approve/Reject buttons
   - On approve: execute file operation via `expo-file-system`
   - On reject: tell agent the tool was rejected
3. Agent orchestration (`lib/ai/agent.ts`):
   - Build system prompt from `agent.md` template
   - Inject current context: file path, language, selection, project structure
   - Manage message history (keep last N messages within token budget)
   - Parse streaming response for tool calls (format: ` ```json ` tool call blocks)
   - Loop: send → receive → parse tools → execute → feed results back → continue
4. Context injection:
   - Current file content (or first 2000 lines if large)
   - Selection range and text
   - File tree (shallow, 2 levels deep)
   - User's last 5 messages

**Checkpoint:** User can chat with agent about code; agent can read files and propose edits with approval UI.

---

### PHASE 4: Provider Management UI

1. Settings → Providers screen:
   - List of configured providers (cards with name, type, model count, status dot)
   - "+ Add Provider" FAB → modal with type picker
   - Type picker: OpenAI / Anthropic / Google / Groq / Custom
2. Add provider form (per type):
   - Built-in (OpenAI/Anthropic/Google/Groq): Name, API Key (masked input), Model picker (fetch from API or use presets)
   - Custom: Name, Base URL, API Key (optional), Headers (key-value pairs), Model list (manual or fetch from `/models`)
   - "Test Connection" button → ping the endpoint with a minimal request
   - Save → store config in registry + key in Keychain
3. Provider card actions:
   - Set as default
   - Edit
   - Delete (with confirmation)
   - Reorder (drag handle)
4. Settings → General:
   - Theme (dark/light/system)
   - Editor font size
   - Vim mode toggle
   - Auto-save toggle
   - Biometric lock toggle
   - Clear chat history

**Checkpoint:** User can add multiple providers, test them, and switch between them.

---

### PHASE 5: Polish & Integration

1. Editor ↔ Agent bridge:
   - "Send to Agent" button in editor toolbar → sends current selection or file to agent
   - Agent can open files in editor (tap a file reference in chat → opens in editor tab)
   - Agent's proposed edits show inline diff in the editor (highlight changes)
2. Streaming optimization:
   - Cancel streaming mid-response
   - Smooth scrolling in chat
   - Token counting display (optional)
3. Error states:
   - No provider configured → prompt to add one
   - API error → show message with retry
   - Keychain error → fallback instructions
4. Performance:
   - Lazy-load language modes
   - Virtualize chat message list
   - Debounce editor changes
5. Testing:
   - Provider layer unit tests (mock fetch)
   - Keychain integration tests
   - Agent tool execution tests
   - Manual E2E: add provider → chat → agent reads file → agent edits file → approve

---

### PHASE 6: Build & Deploy

1. EAS Build configuration:
   - `eas.json` with development, preview, and production profiles
   - iOS: configure bundle ID, provisioning
   - Android: configure package name, keystore
2. App icons and splash screens
3. Privacy policy (required for API key usage)
4. App store listings (description, screenshots)

---

## 🔐 SECURITY CHECKLIST (Non-Negotiable)

- [ ] All API keys stored in iOS Keychain / Android Keystore
- [ ] Keys never logged, never in plaintext in app storage
- [ ] Keys never transmitted to any server except the configured provider
- [ ] Custom endpoints: allow HTTP only with explicit user warning
- [ ] File operations sandboxed to selected project folder
- [ ] Biometric app lock option
- [ ] No analytics without opt-in
- [ ] Network requests use certificate pinning (optional, future)

---

## 🧪 TESTING CHECKLIST

- [ ] Add OpenAI key → chat works → streaming works
- [ ] Add Anthropic key → chat works
- [ ] Add Google key → chat works
- [ ] Add custom endpoint (Ollama `http://localhost:11434`) → chat works
- [ ] Agent reads file → shows content
- [ ] Agent proposes edit → diff shown → approve → file changed
- [ ] Agent proposes edit → reject → file unchanged
- [ ] Switch provider mid-chat → works
- [ ] Delete provider → key removed from keychain
- [ ] App backgrounded → streaming stops cleanly
- [ ] Offline → editor works, agent shows "no network" message

---

## 📝 IMPORTANT NOTES FOR THE AI BUILDER

1. **Start small.** Get the editor working with one provider (OpenAI) before adding others.
2. **Security first.** If you're unsure about key storage, ask. Never hardcode keys or put them in AsyncStorage.
3. **Streaming is critical.** Users expect token-by-token output like ChatGPT.
4. **Approval UI is critical.** Never auto-apply file edits. Always show diff + approve/reject.
5. **Test on device.** Simulators don't have Keychain properly; test on real device for key storage.
6. **Code quality.** Use TypeScript strictly. No `any` types in the AI layer. Document all interfaces.

---

## 🚀 QUICK START COMMAND SEQUENCE

```bash
# 1. Scaffold
npx create-expo-app@latest CodeForgeMobile --template tabs
cd CodeForgeMobile

# 2. Install core deps
npx expo install @uiw/react-codemirror @codemirror/basic-setup \
  @codemirror/lang-javascript @codemirror/lang-python @codemirror/lang-rust \
  @codemirror/lang-go @codemirror/lang-json @codemirror/theme-one-dark \
  react-native-keychain @react-native-async-storage/async-storage \
  expo-file-system expo-document-picker react-native-markdown-display zustand

# 3. Start
npx expo run:ios    # or run:android
```

---

**Now begin with PHASE 1. Report progress after each checkpoint.**
