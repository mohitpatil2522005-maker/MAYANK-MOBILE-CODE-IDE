/**
 * Extends `app.json` with the few native values that must differ per EAS build
 * profile. `app.json` remains the single source of truth for static config —
 * Expo passes it to this function as `config`, and we only append to it.
 *
 * ## Why cleartext HTTP is enabled (and where it is not)
 *
 * Mayank IDE supports user-registered custom provider endpoints
 * (`src/lib/ai/presets.ts` defaults to `http://localhost:11434/v1` for Ollama,
 * and `PRD.md` documents `http://192.168.1.50:11434/v1`). Android 9+ blocks
 * cleartext HTTP whenever `targetSdkVersion >= 28` — this app targets SDK 36 —
 * so in a release build those endpoints are unreachable and the agent fails to
 * connect to local model servers (Ollama, LM Studio, vLLM).
 *
 * The app already requires an explicit user opt-in for `http://` endpoints and
 * surfaces a warning in the provider editor (`isInsecureEndpoint()` consumed by
 * `src/components/settings/ProviderModal.tsx`, PRD §6), so the UI-level guard
 * stays in place regardless of this flag.
 *
 * Scope: `usesCleartextTraffic` is enabled for internal builds (preview /
 * development) and left at Android's secure default for `production`, which
 * keeps store builds HTTPS-only. Note the default is *enabled* when
 * `EAS_BUILD_PROFILE` is unset, so a local `expo prebuild` and any
 * non-production profile keep local-server support, while an explicit
 * `production` build opts out.
 *
 * @type {import('expo/config').ExpoConfig}
 */
const BUILD_PROPERTIES_PLUGIN = 'expo-build-properties';

module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE ?? '';
  const isProduction = profile === 'production';

  // Keep app.json authoritative: drop a bare entry, then re-add it configured.
  const plugins = (config.plugins ?? []).filter(
    (plugin) => (typeof plugin === 'string' ? plugin : plugin[0]) !== BUILD_PROPERTIES_PLUGIN
  );

  return {
    ...config,
    plugins: [
      ...plugins,
      [
        BUILD_PROPERTIES_PLUGIN,
        {
          android: {
            // Lets preview/dev builds reach http://localhost:11434 (Ollama) and
            // http://<lan-ip>:11434 (LM Studio, vLLM). Production keeps Android's
            // default (no cleartext).
            usesCleartextTraffic: !isProduction,
          },
        },
      ],
    ],
  };
};
