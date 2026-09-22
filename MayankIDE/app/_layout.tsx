import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { usePalette } from '@/src/constants/theme';
import { useProviderRegistry } from '@/src/lib/ai/registry';
import { useAgentStore } from '@/src/store/agentStore';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export default function RootLayout() {
  const palette = usePalette();

  // One-time hydration: provider configs, session, and model preference.
  useEffect(() => {
    void useProviderRegistry.getState().hydrate();
    void useAgentStore.getState().loadModelPref();
    void useAgentStore.getState().hydrateSession();
  }, []);

  return (
    <ThemeProvider value={palette.dark ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
      <StatusBar style={palette.dark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
