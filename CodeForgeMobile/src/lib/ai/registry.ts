/**
 * Provider registry — CRUD for AIProviderConfig entries.
 * Persisted to AsyncStorage; contains NO secrets (keys are in keychain).
 * Deleting a provider also removes its keychain entry.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { deleteApiKey } from '@/src/lib/storage/keychain';
import type { AIModel, AIProviderConfig, ProviderType } from './types';

const REGISTRY_KEY = 'codeforge/providers/v1';

export interface NewProviderInput {
  name: string;
  type: ProviderType;
  baseURL: string;
  customHeaders?: Record<string, string>;
  models?: AIModel[];
  defaultModel?: string;
}

interface RegistryState {
  providers: AIProviderConfig[];
  defaultProviderId: string | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  addProvider: (input: NewProviderInput) => AIProviderConfig;
  updateProvider: (id: string, patch: Partial<Omit<AIProviderConfig, 'id' | 'createdAt'>>) => void;
  deleteProvider: (id: string) => Promise<void>;
  setDefaultProvider: (id: string | null) => void;
  setModels: (id: string, models: AIModel[]) => void;
  getProvider: (id: string) => AIProviderConfig | undefined;
}

interface PersistedRegistry {
  providers: AIProviderConfig[];
  defaultProviderId: string | null;
}

function makeId(type: ProviderType): string {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function persist(state: Pick<RegistryState, 'providers' | 'defaultProviderId'>): Promise<void> {
  const payload: PersistedRegistry = {
    providers: state.providers,
    defaultProviderId: state.defaultProviderId,
  };
  await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(payload)).catch(() => undefined);
}

export const useProviderRegistry = create<RegistryState>()((set, get) => {
  const setAndPersist = (
    patch: Partial<Pick<RegistryState, 'providers' | 'defaultProviderId'>>,
  ) => {
    set(patch);
    void persist(get());
  };

  return {
    providers: [],
    defaultProviderId: null,
    hydrated: false,

    async hydrate() {
      if (get().hydrated) return;
      try {
        const raw = await AsyncStorage.getItem(REGISTRY_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as PersistedRegistry;
          set({
            providers: Array.isArray(parsed.providers) ? parsed.providers : [],
            defaultProviderId: parsed.defaultProviderId ?? null,
            hydrated: true,
          });
          return;
        }
      } catch {
        // corrupted payload → start fresh
      }
      set({ hydrated: true });
    },

    addProvider(input) {
      const config: AIProviderConfig = {
        id: makeId(input.type),
        name: input.name.trim() || 'Untitled provider',
        type: input.type,
        baseURL: input.baseURL.trim(),
        customHeaders: input.customHeaders,
        models: input.models ?? [],
        defaultModel: input.defaultModel ?? input.models?.[0]?.id,
        createdAt: Date.now(),
      };
      const providers = [...get().providers, config];
      setAndPersist({
        providers,
        // first provider becomes the default automatically
        defaultProviderId: get().defaultProviderId ?? config.id,
      });
      return config;
    },

    updateProvider(id, patch) {
      setAndPersist({
        providers: get().providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      });
    },

    async deleteProvider(id) {
      await deleteApiKey(id); // keychain cleanup first
      const providers = get().providers.filter((p) => p.id !== id);
      setAndPersist({
        providers,
        defaultProviderId:
          get().defaultProviderId === id ? (providers[0]?.id ?? null) : get().defaultProviderId,
      });
    },

    setDefaultProvider(id) {
      setAndPersist({ defaultProviderId: id });
    },

    setModels(id, models) {
      setAndPersist({
        providers: get().providers.map((p) =>
          p.id === id
            ? {
                ...p,
                models,
                defaultModel:
                  p.defaultModel && models.some((m) => m.id === p.defaultModel)
                    ? p.defaultModel
                    : models[0]?.id,
              }
            : p,
        ),
      });
    },

    getProvider(id) {
      return get().providers.find((p) => p.id === id);
    },
  };
});

/** Convenience selector for the zustand-free parts of the app. */
export function getDefaultProvider(): AIProviderConfig | undefined {
  const { providers, defaultProviderId } = useProviderRegistry.getState();
  return providers.find((p) => p.id === defaultProviderId) ?? providers[0];
}
