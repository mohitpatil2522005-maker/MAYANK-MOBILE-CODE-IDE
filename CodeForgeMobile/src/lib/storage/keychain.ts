/**
 * API key storage — the ONLY sanctioned place for secrets.
 *
 * Native: OS keystore via react-native-keychain (iOS Keychain /
 * Android Keystore). Keys never touch AsyncStorage or app state.
 * Web: in-memory map (session-scoped, never persisted) — a deliberate
 * security choice over localStorage.
 *
 * NOTE: react-native-keychain requires a dev build (not Expo Go);
 * Phase 6 covers EAS config. Callers must degrade gracefully.
 */
import { Platform } from 'react-native';

const SERVICE_PREFIX = 'codeforge.provider.';
const webMemory = new Map<string, string>();

interface KeychainModule {
  setGenericPassword(
    username: string,
    password: string,
    options?: { service?: string; accessControl?: string; accessible?: string },
  ): Promise<unknown>;
  getGenericPassword(options?: {
    service?: string;
    authenticationPrompt?: { title?: string; cancel?: string } | string;
  }): Promise<false | { username: string; password: string }>;
  resetGenericPassword(options?: { service?: string }): Promise<unknown>;
}

// react-native-keychain ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE — kept
// as a literal so this module never hard-depends on the native import.
const BIOMETRIC_ACCESS = 'BiometryAnyOrDevicePasscode';

async function keychain(): Promise<KeychainModule> {
  const mod = (await import('react-native-keychain')) as unknown as {
    default?: KeychainModule;
  } & KeychainModule;
  return mod.default ?? mod;
}

/**
 * Save an API key into the OS keystore.
 * When `requireBiometric` is true, the keychain entry demands Face ID /
 * fingerprint / device passcode on EVERY retrieval (PRD 3.2).
 */
export async function setApiKey(
  providerId: string,
  key: string,
  requireBiometric = false,
): Promise<void> {
  if (Platform.OS === 'web') {
    webMemory.set(providerId, key);
    return;
  }
  const kc = await keychain();
  await kc.setGenericPassword('api-key', key, {
    service: SERVICE_PREFIX + providerId,
    ...(requireBiometric ? { accessControl: BIOMETRIC_ACCESS } : {}),
  });
}

export async function getApiKey(providerId: string): Promise<string | null> {
  if (Platform.OS === 'web') return webMemory.get(providerId) ?? null;
  try {
    const kc = await keychain();
    const creds = await kc.getGenericPassword({ service: SERVICE_PREFIX + providerId });
    return creds ? creds.password : null;
  } catch {
    return null; // module unavailable (Expo Go) or no entry — treated as "no key"
  }
}

export async function deleteApiKey(providerId: string): Promise<void> {
  if (Platform.OS === 'web') {
    webMemory.delete(providerId);
    return;
  }
  try {
    const kc = await keychain();
    await kc.resetGenericPassword({ service: SERVICE_PREFIX + providerId });
  } catch {
    // unavailable module — nothing to clean up
  }
}
