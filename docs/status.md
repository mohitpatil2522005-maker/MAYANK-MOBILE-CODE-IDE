# Status ledger — Mayank IDE

Single source of truth for progress (masterprompt §0.2 rule 12). Newest entry first.

---

## 2026-09-22 — Slice: "v2 gap audit + modes/usage/audit + bug fixes + golden sessions"

**What changed**
- Added agent modes **Ask / Plan / Agent / Goal** (masterprompt §9.2) with contractual
  read-only enforcement, per-mode step caps, mode section in the system prompt, mode
  selector UI in the Agent tab, persisted preference.
- Added **session usage meter** (§8.3, estimate mode): input/output token estimates +
  model-call count in the agent status strip; reset by New Chat.
- Added **agent activity audit log** (§9.3b): every tool decision recorded (auto-executed /
  pending / approved / rejected / failed / mode-blocked) with tool, target, mode; capped
  ring (200) persisted to AsyncStorage; **Settings → Agent activity** with copy-log + clear.
  No file contents or secrets stored.
- New **golden-session test suite** (§13.5): scripted runs through the real agent store +
  SSE transport + tool executor + approval gating against a fake provider (esbuild-bundled
  with Node-safe RN stubs; see `tests/golden/build.cjs` for the rationale).
- Bug fixes:
  - Approval-resumed turns now count against the safety cap (was unbounded — infinite
    approve-loop risk).
  - `read_file` now reads the open editor buffer (dirty content) instead of disk.
  - Internal `note` messages no longer leak into the model history.
  - `stripStreamingToolText` no longer hides text after *closed* json fences mid-stream.
  - Demo-project root is now routed through the FS layer (`demoRootActive` flag) —
    agent `write_file` for new files worked again on the demo project (web + native).
- Docs: `docs/gap-analysis.md` (full M0–M12 status + remaining work plan), this ledger.

**What is verified**
- `tsc --noEmit`: 0 errors.
- `npm test`: **232 passed, 0 failed** across 8 suites (7 logic suites + golden session).
- Metro web bundle compiles (1,137 modules); live web preview restarted with the changes.

**What is mocked / stubbed**
- Golden test: fake `XMLHttpRequest` serving recorded OpenAI-SSE fixtures; in-memory
  AsyncStorage; `react-native` / `expo-file-system` stubbed (Node environment). The app
  code under test is real, unmodified.
- Usage numbers are local estimates (`chars/4`) — adapters do not parse provider-reported
  `usage` yet.

**What is next (priority order — see docs/gap-analysis.md §3)**
1. Search view + find&replace + index (§6.2)
2. Git adapter + source-control tab (§6.3)
3. Full diff editor pane (reuses `src/lib/diff.ts`)
4. Responsive shell: rail + agent HUD (§4.1/§4.4)
5. Permission-engine rules, checkpoints/rollback, persistent usage ledger, provider
   fallback router
6. New surfaces: artifacts + browser tool, terminal/tasks, extension worker runtime, MCP.

**Blockers / open questions**
- No headless browser in this sandbox (binary CDNs blocked) → UI interaction verified by
  code audit + bundle compile + logic suites, not by automated clicking. Manual checklist
  is in `docs/gap-analysis.md` §4.
- `react-native-keychain` requires a dev build (not Expo Go) — EAS config is a later slice.
- Web API keys are session-scoped by design (never persisted to browser storage).
