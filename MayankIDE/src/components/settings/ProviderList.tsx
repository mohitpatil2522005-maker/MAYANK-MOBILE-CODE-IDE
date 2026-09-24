/**
 * Settings → Providers: list configured providers with status, test,
 * default, edit and delete actions (master_prompt Phase 4).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Palette } from '@/src/constants/theme';
import { PROVIDER_PRESETS } from '@/src/lib/ai/presets';
import { createProviderClient } from '@/src/lib/ai/providers';
import { useProviderRegistry } from '@/src/lib/ai/registry';
import type { AIProviderConfig, TestResult } from '@/src/lib/ai/types';
import { getApiKey } from '@/src/lib/storage/keychain';
import { ProviderModal } from './ProviderModal';

async function confirmDelete(name: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const g = globalThis as { confirm?: (msg: string) => boolean };
    return typeof g.confirm === 'function'
      ? g.confirm(`Delete "${name}"? Its API key will be removed from secure storage.`)
      : true;
  }
  return new Promise((resolve) => {
    Alert.alert('Delete provider?', `"${name}" and its stored API key will be removed.`, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export function ProviderList({ palette }: { palette: Palette }) {
  const providers = useProviderRegistry((s) => s.providers);
  const defaultProviderId = useProviderRegistry((s) => s.defaultProviderId);
  const setDefaultProvider = useProviderRegistry((s) => s.setDefaultProvider);
  const deleteProvider = useProviderRegistry((s) => s.deleteProvider);
  const updateProvider = useProviderRegistry((s) => s.updateProvider);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AIProviderConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const runTest = async (provider: AIProviderConfig) => {
    setTestingId(provider.id);
    try {
      const client = createProviderClient(provider);
      const key = (await getApiKey(provider.id))?.trim() || null;
      if (!key && PROVIDER_PRESETS[provider.type].requiresKey) {
        setTestResults((prev) => ({
          ...prev,
          [provider.id]: {
            ok: false,
            message: `No API key stored for ${provider.name} — open Edit and paste the key first.`,
          },
        }));
        return;
      }
      const result = await client.testConnection(key);
      setTestResults((prev) => ({ ...prev, [provider.id]: result }));
      if (result.ok) updateProvider(provider.id, { lastTestOkAt: Date.now() });
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [provider.id]: { ok: false, message: err instanceof Error ? err.message : String(err) },
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <View style={styles.container}>
      {providers.length === 0 && (
        <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
          No providers yet. Add one to start chatting with Forge — your keys never leave this
          device except to the provider you choose.
        </Text>
      )}

      {providers.map((provider) => {
        const isDefault = provider.id === defaultProviderId;
        const preset = PROVIDER_PRESETS[provider.type];
        const result = testResults[provider.id];
        const tested = !!provider.lastTestOkAt;
        return (
          <View
            key={provider.id}
            style={[styles.card, { backgroundColor: palette.bgSecondary, borderColor: palette.border }]}
          >
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: tested ? palette.success : palette.textSecondary },
                ]}
              />
              <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={1}>
                {provider.name}
              </Text>
              {isDefault && (
                <View style={[styles.defaultBadge, { backgroundColor: palette.tint }]}>
                  <Text style={[styles.defaultBadgeText, { color: palette.onTint }]}>DEFAULT</Text>
                </View>
              )}
            </View>
            <Text style={[styles.cardMeta, { color: palette.textSecondary }]} numberOfLines={2}>
              {preset.label} · {provider.models.length} model{provider.models.length === 1 ? '' : 's'}
            </Text>
            <Text style={[styles.cardUrl, { color: palette.textSecondary }]} numberOfLines={1}>
              {provider.baseURL}
            </Text>

            {result && (
              <Text
                style={[styles.testResult, { color: result.ok ? palette.success : palette.danger }]}
                numberOfLines={2}
              >
                {result.ok ? '✓ ' : '✗ '}
                {result.message}
                {result.latencyMs !== undefined && result.ok ? ` (${result.latencyMs}ms)` : ''}
              </Text>
            )}

            <View style={styles.cardActions}>
              <ActionButton
                palette={palette}
                icon="pulse-outline"
                label={testingId === provider.id ? 'Testing…' : 'Test'}
                onPress={() => void runTest(provider)}
                busy={testingId === provider.id}
              />
              {!isDefault && (
                <ActionButton
                  palette={palette}
                  icon="star-outline"
                  label="Make default"
                  onPress={() => setDefaultProvider(provider.id)}
                />
              )}
              <ActionButton
                palette={palette}
                icon="create-outline"
                label="Edit"
                onPress={() => {
                  setEditing(provider);
                  setModalOpen(true);
                }}
              />
              <ActionButton
                palette={palette}
                icon="trash-outline"
                label="Delete"
                danger
                onPress={() => {
                  void confirmDelete(provider.name).then((ok) => {
                    if (ok) void deleteProvider(provider.id);
                  });
                }}
              />
            </View>
          </View>
        );
      })}

      <Pressable
        onPress={() => {
          setEditing(null);
          setModalOpen(true);
        }}
        style={({ pressed }) => [
          styles.addButton,
          { backgroundColor: palette.tint },
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={18} color={palette.onTint} />
        <Text style={[styles.addButtonText, { color: palette.onTint }]}>Add provider</Text>
      </Pressable>

      <ProviderModal
        visible={modalOpen}
        palette={palette}
        editProvider={editing}
        onClose={() => setModalOpen(false)}
      />
    </View>
  );
}

function ActionButton({
  palette,
  icon,
  label,
  onPress,
  danger,
  busy,
}: {
  palette: Palette;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  busy?: boolean;
}) {
  const color = danger ? palette.danger : palette.tint;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.actionButton,
        { borderColor: color },
        (pressed || busy) && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
    >
      {busy ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name={icon} size={13} color={color} />
      )}
      <Text style={[styles.actionButtonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  emptyText: { fontSize: 12.5, lineHeight: 18 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  cardTitle: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  defaultBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  defaultBadgeText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  cardMeta: { fontSize: 12 },
  cardUrl: { fontSize: 11, fontFamily: 'monospace' as never },
  testResult: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionButtonText: { fontSize: 11.5, fontWeight: '600' },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 11,
    marginTop: 4,
  },
  addButtonText: { fontSize: 14, fontWeight: '700' },
});
