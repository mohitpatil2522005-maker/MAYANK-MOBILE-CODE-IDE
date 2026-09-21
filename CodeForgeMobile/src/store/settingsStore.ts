/**
 * Non-sensitive user settings, persisted to AsyncStorage.
 * SECURITY: never store API keys here — keychain only (Phase 2).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'system' | 'light' | 'dark';

interface SettingsState {
  themeMode: ThemeMode;
  editorFontSize: number; // px
  vimEnabled: boolean;
  autoSave: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setEditorFontSize: (px: number) => void;
  setVimEnabled: (enabled: boolean) => void;
  setAutoSave: (enabled: boolean) => void;
}

const MIN_FONT = 10;
const MAX_FONT = 24;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      editorFontSize: 14,
      vimEnabled: false,
      autoSave: false,
      setThemeMode: (themeMode) => set({ themeMode }),
      setEditorFontSize: (px) =>
        set({ editorFontSize: Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(px))) }),
      setVimEnabled: (vimEnabled) => set({ vimEnabled }),
      setAutoSave: (autoSave) => set({ autoSave }),
    }),
    {
      name: 'codeforge/settings/v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
