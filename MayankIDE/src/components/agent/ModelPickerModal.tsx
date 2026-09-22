/**
 * Modal for picking the (provider, model) pair used by the agent.
 * Lists every configured provider and its models; switching is allowed
 * mid-conversation (PRD US-08).
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Palette } from '@/src/constants/theme';
import { PROVIDER_PRESETS } from '@/src/lib/ai/presets';
import { useProviderRegistry } from '@/src/lib/ai/registry';
import { useAgentStore } from '@/src/store/agentStore';

interface ModelPickerModalProps {
  visible: boolean;
  palette: Palette;
  onClose: () => void;
}

export function ModelPickerModal({ visible, palette, onClose }: ModelPickerModalProps) {
  const providers = useProviderRegistry((s) => s.providers);
  const activeProviderId = useAgentStore((s) => s.activeProviderId);
  const activeModel = useAgentStore((s) => s.activeModel);
  const selectModel = useAgentStore((s) => s.selectModel);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable
          style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="none"
        >
          <View style={[styles.sheetHeader, { borderColor: palette.border }]}>
            <Text style={[styles.sheetTitle, { color: palette.text }]}>Model for this chat</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={18} color={palette.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {providers.length === 0 && (
              <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
                No providers configured — add one in Settings → Providers.
              </Text>
            )}
            {providers.map((provider) => (
              <View key={provider.id} style={styles.providerSection}>
                <View style={styles.providerHeader}>
                  <Ionicons name="server-outline" size={13} color={palette.tint} />
                  <Text style={[styles.providerName, { color: palette.text }]}>
                    {provider.name}
                  </Text>
                  <Text style={[styles.providerType, { color: palette.textSecondary }]}>
                    {PROVIDER_PRESETS[provider.type].label}
                  </Text>
                </View>
                {provider.models.length === 0 && (
                  <Text style={[styles.noModels, { color: palette.textSecondary }]}>
                    No models — edit this provider in Settings to fetch or enter models.
                  </Text>
                )}
                {provider.models.map((model) => {
                  const selected = provider.id === activeProviderId && model.id === activeModel;
                  return (
                    <Pressable
                      key={model.id}
                      onPress={() => {
                        selectModel(provider.id, model.id);
                        onClose();
                      }}
                      style={({ pressed }) => [
                        styles.modelRow,
                        { borderColor: palette.border },
                        selected && { borderColor: palette.tint, backgroundColor: palette.bgSecondary },
                        pressed && { backgroundColor: palette.surfacePressed },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                    >
                      <Ionicons
                        name={selected ? 'radio-button-on' : 'radio-button-off'}
                        size={16}
                        color={selected ? palette.tint : palette.textSecondary}
                      />
                      <View style={styles.modelTextBlock}>
                        <Text style={[styles.modelName, { color: palette.text }]}>
                          {model.displayName ?? model.id}
                        </Text>
                        <Text style={[styles.modelMeta, { color: palette.textSecondary }]} numberOfLines={1}>
                          {model.id}
                          {model.contextWindow
                            ? ` · ${Math.round(model.contextWindow / 1000)}K ctx`
                            : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <View style={styles.bottomPad} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '80%',
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 15.5, fontWeight: '700' },
  list: { paddingHorizontal: 16 },
  emptyText: { fontSize: 13, lineHeight: 19, paddingVertical: 20, textAlign: 'center' },
  providerSection: { marginTop: 14 },
  providerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  providerName: { fontSize: 13.5, fontWeight: '700' },
  providerType: { fontSize: 11.5 },
  noModels: { fontSize: 12, paddingVertical: 4 },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  modelTextBlock: { flexShrink: 1 },
  modelName: { fontSize: 13.5, fontWeight: '600' },
  modelMeta: { fontSize: 11, marginTop: 1 },
  bottomPad: { height: 20 },
});
