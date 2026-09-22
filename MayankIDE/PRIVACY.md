# Privacy Policy — Mayank IDE

_Last updated: 2026-09-21_

Mayank IDE is a **local-first** developer tool. This document describes exactly
what the app does with your data. It exists because app stores require a privacy
policy; it is short because the app genuinely collects almost nothing.

## What stays on your device (always)

- **API keys.** Stored only in the iOS Keychain / Android Keystore (hardware-backed
  where available). Never logged, never stored in plain files, never synced.
- **Your code and files.** Read and written only inside the project folder you
  explicitly open. The app has no server; files never leave your device except as
  described below.
- **Settings and chat sessions.** Stored locally (AsyncStorage / in-memory).

## What leaves your device, and where

The only network requests the app makes are:

1. **AI provider API calls.** When you chat with the agent, the relevant portion of
   your project context (open file, selection, file tree snippets, conversation) is
   sent **directly from your device to the AI provider endpoint you configured**
   (OpenAI, Anthropic, Google, Groq, or your own custom URL such as a local Ollama
   server). Your API key is sent only to that endpoint. Configure or remove these
   providers at any time in Settings → Providers.
2. **Model lists.** `GET /models` requests to your configured endpoints, on demand.

The app communicates with **no other servers**. There are no analytics, no crash
reporters, no ads, no tracking SDKs, no account system.

## Custom endpoints over http://

If you deliberately configure an `http://` endpoint (e.g. a LAN Ollama server), traffic
to it is unencrypted. The app warns you in the UI when you enter such an endpoint.
Only use this on trusted networks.

## Third-party services

Your use of an AI provider is governed by that provider's own privacy policy; review
it for details on how they handle API data. Mayank IDE does not control, and is
not responsible for, those services.

## Changes

Any future feature that changes data handling (e.g. opt-in telemetry) will be called
out in release notes and this document.

## Contact

Open an issue on the project repository for privacy questions.
