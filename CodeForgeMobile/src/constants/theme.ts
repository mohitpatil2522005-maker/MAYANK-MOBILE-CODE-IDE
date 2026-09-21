/**
 * CodeForge Mobile — design tokens.
 * Dark palette is tuned to match the CodeMirror "oneDark" editor theme so the
 * editor chrome blends into the surrounding UI.
 */
import { useColorScheme } from 'react-native';

import { useSettingsStore } from '@/src/store/settingsStore';

export interface Palette {
  dark: boolean;
  bg: string;
  bgSecondary: string;
  surface: string;
  surfacePressed: string;
  border: string;
  text: string;
  textSecondary: string;
  tint: string;
  onTint: string;
  danger: string;
  success: string;
  warning: string;
  editorBg: string;
  inputBg: string;
  shadow: string;
}

export const darkPalette: Palette = {
  dark: true,
  bg: '#0d1117',
  bgSecondary: '#161b22',
  surface: '#1c2129',
  surfacePressed: '#2d333b',
  border: '#2d333b',
  text: '#e6edf3',
  textSecondary: '#9198a1',
  tint: '#58a6ff',
  onTint: '#0d1117',
  danger: '#f85149',
  success: '#3fb950',
  warning: '#d29922',
  editorBg: '#282c34', // matches oneDark
  inputBg: '#161b22',
  shadow: '#000000',
};

export const lightPalette: Palette = {
  dark: false,
  bg: '#ffffff',
  bgSecondary: '#f6f8fa',
  surface: '#ffffff',
  surfacePressed: '#eaeef2',
  border: '#d1d9e0',
  text: '#1f2328',
  textSecondary: '#59636e',
  tint: '#0969da',
  onTint: '#ffffff',
  danger: '#d1242f',
  success: '#1a7f37',
  warning: '#9a6700',
  editorBg: '#ffffff',
  inputBg: '#f6f8fa',
  shadow: '#1f2328',
};

/** Resolve the active palette from settings (system / light / dark). */
export function usePalette(): Palette {
  const system = useColorScheme();
  const mode = useSettingsStore((s) => s.themeMode);
  const dark = mode === 'system' ? system === 'dark' : mode === 'dark';
  return dark ? darkPalette : lightPalette;
}
