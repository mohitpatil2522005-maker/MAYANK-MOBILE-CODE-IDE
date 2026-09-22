/**
 * Extension state (Phase 2) — which bundled extensions are installed/enabled.
 * Non-sensitive, so AsyncStorage persistence is fine (never API keys).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { getThemeSpec, type EditorThemeSpec } from '@/src/lib/extensions/themes';

interface ExtensionState {
  /** Enabled theme extension id, or null for the built-in default. */
  activeThemeId: string | null;
  /** Installed extension ids (all bundled themes are "installable"). */
  installedIds: string[];
  installExtension: (id: string) => void;
  uninstallExtension: (id: string) => void;
  setActiveTheme: (id: string | null) => void;
}

export const useExtensionStore = create<ExtensionState>()(
  persist(
    (set) => ({
      activeThemeId: null,
      installedIds: [],
      installExtension: (id) =>
        set((s) => (s.installedIds.includes(id) ? s : { installedIds: [...s.installedIds, id] })),
      uninstallExtension: (id) =>
        set((s) => ({
          installedIds: s.installedIds.filter((x) => x !== id),
          // Uninstalling the active theme reverts to the built-in default.
          activeThemeId: s.activeThemeId === id ? null : s.activeThemeId,
        })),
      setActiveTheme: (id) =>
        set((s) => ({
          activeThemeId: id,
          installedIds:
            id && !s.installedIds.includes(id) ? [...s.installedIds, id] : s.installedIds,
        })),
    }),
    { name: 'mayank-ide/extensions/v1', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/** Convenience: current editor theme spec (null → built-in oneDark/light). */
export function activeEditorThemeSpec(): EditorThemeSpec | null {
  return getThemeSpec(useExtensionStore.getState().activeThemeId);
}
