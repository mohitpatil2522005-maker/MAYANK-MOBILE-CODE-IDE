/**
 * Non-sensitive user settings, persisted to AsyncStorage.
 * SECURITY: never store API keys here — keychain only (Phase 2).
 *
 * Definitions + defaults live in src/lib/settings/schema.ts (VS Code-style
 * schema); this store keeps the persisted values flat and exposes a generic
 * setOption() that validates against the schema (type check + clamp).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SETTING_DEFS, SETTING_DEFAULTS, type SettingValue } from '@/src/lib/settings/schema';

export type ThemeMode = 'system' | 'light' | 'dark';

interface SettingsState {
  // Appearance
  themeMode: ThemeMode;
  // Editor
  editorFontSize: number; // px
  tabSize: number;
  wordWrap: boolean;
  lineNumbersEnabled: boolean;
  vimEnabled: boolean;
  // Editor features
  autocompleteEnabled: boolean;
  activeLineEnabled: boolean;
  bracketsEnabled: boolean;
  whitespaceVisible: boolean;
  // Files
  autoSave: boolean;
  // Security
  biometricKeyGate: boolean;

  /** Schema-validated generic setter used by the settings screen. */
  setOption: (key: string, value: SettingValue) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setEditorFontSize: (px: number) => void;
  setVimEnabled: (enabled: boolean) => void;
  setAutoSave: (enabled: boolean) => void;
}

const MIN_FONT = 10;
const MAX_FONT = 24;

/** Validate + normalize a value against its setting definition. */
export function coerceSettingValue(key: string, value: SettingValue): SettingValue | null {
  const def = SETTING_DEFS.find((d) => d.key === key);
  if (!def) return null;
  switch (def.kind) {
    case 'boolean':
      return typeof value === 'boolean' ? value : null;
    case 'enum':
      return typeof value === 'string' && def.choices.some((c) => c.value === value) ? value : null;
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) return null;
      const stepped = def.step > 0 ? Math.round(value / def.step) * def.step : value;
      return Math.min(def.max, Math.max(def.min, stepped));
    }
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      themeMode: (SETTING_DEFAULTS.themeMode as ThemeMode) ?? 'system',
      editorFontSize: Number(SETTING_DEFAULTS.editorFontSize) || 14,
      tabSize: Number(SETTING_DEFAULTS.tabSize) || 2,
      wordWrap: SETTING_DEFAULTS.wordWrap !== false,
      lineNumbersEnabled: SETTING_DEFAULTS.lineNumbersEnabled !== false,
      vimEnabled: SETTING_DEFAULTS.vimEnabled === true,
      autocompleteEnabled: SETTING_DEFAULTS.autocompleteEnabled !== false,
      activeLineEnabled: SETTING_DEFAULTS.activeLineEnabled !== false,
      bracketsEnabled: SETTING_DEFAULTS.bracketsEnabled !== false,
      whitespaceVisible: SETTING_DEFAULTS.whitespaceVisible === true,
      autoSave: SETTING_DEFAULTS.autoSave === true,
      biometricKeyGate: SETTING_DEFAULTS.biometricKeyGate === true,

      setOption: (key, value) => {
        const coerced = coerceSettingValue(key, value);
        if (coerced === null) return;
        // tabSize is persisted as a number but declared enum (2/4/8 strings).
        const final = key === 'tabSize' ? Number(coerced) : coerced;
        if ((get() as unknown as Record<string, unknown>)[key] === final) return;
        set({ [key]: final } as Partial<SettingsState>);
      },
      setThemeMode: (themeMode) => set({ themeMode }),
      setEditorFontSize: (px) => get().setOption('editorFontSize', px),
      setVimEnabled: (vimEnabled) => set({ vimEnabled }),
      setAutoSave: (autoSave) => set({ autoSave }),
    }),
    {
      name: 'codeforge/settings/v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Backfill newly added keys with schema defaults on rehydrate.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        const merged: Record<string, unknown> = { ...current };
        for (const def of SETTING_DEFS) {
          if (p[def.key] !== undefined) {
            merged[def.key] =
              def.key === 'tabSize' ? Number(p[def.key]) || Number(def.defaultValue) : p[def.key];
          }
        }
        return merged as unknown as SettingsState;
      },
    },
  ),
);

export { MIN_FONT, MAX_FONT };
