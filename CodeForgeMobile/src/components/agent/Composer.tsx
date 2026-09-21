/**
 * Chat composer: multiline input, send/stop button, and context-aware quick
 * actions (Explain / Fix / Refactor / Comments) above the field.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Palette } from '@/src/constants/theme';
import { useAgentStore, type AgentPhase } from '@/src/store/agentStore';

export type QuickAction = 'explain' | 'explain-selection' | 'fix' | 'refactor' | 'comments';

interface ComposerProps {
  palette: Palette;
  phase: AgentPhase;
  hasActiveFile: boolean;
  hasSelection: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  onQuickAction: (action: QuickAction) => void;
}

const QUICK_ACTIONS: { id: QuickAction; label: string; icon: keyof typeof Ionicons.glyphMap; needsSelection?: boolean }[] = [
  { id: 'explain', label: 'Explain file', icon: 'book-outline' },
  { id: 'explain-selection', label: 'Explain selection', icon: 'help-circle-outline', needsSelection: true },
  { id: 'fix', label: 'Fix bugs', icon: 'bandage-outline' },
  { id: 'refactor', label: 'Refactor', icon: 'git-branch-outline' },
  { id: 'comments', label: 'Add comments', icon: 'chatbox-ellipses-outline' },
];

export function Composer({
  palette,
  phase,
  hasActiveFile,
  hasSelection,
  onSend,
  onCancel,
  onQuickAction,
}: ComposerProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const streaming = phase === 'streaming';
  const awaiting = phase === 'awaiting-approval';
  const canSend = text.trim().length > 0 && phase === 'idle';

  // "Send to Agent" from the editor stages a draft here.
  const draft = useAgentStore((s) => s.draft);
  const setDraft = useAgentStore((s) => s.setDraft);
  useEffect(() => {
    if (draft !== null) {
      setText((current) => (current.trim().length > 0 ? current : draft));
      setDraft(null);
      // Focus after the draft lands so the user can continue typing.
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [draft, setDraft]);

  const submit = () => {
    if (!canSend) return;
    const value = text.trim();
    setText('');
    onSend(value);
  };

  const quickActions = hasActiveFile
    ? QUICK_ACTIONS.filter((a) => !a.needsSelection || hasSelection)
    : [];

  return (
    <View style={[styles.container, { backgroundColor: palette.bgSecondary, borderColor: palette.border }]}>
      {quickActions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.quickRow}
        >
          {quickActions.map((action) => (
            <Pressable
              key={action.id}
              onPress={() => onQuickAction(action.id)}
              disabled={phase !== 'idle'}
              style={({ pressed }) => [
                styles.quickChip,
                { borderColor: palette.border, backgroundColor: palette.surface },
                pressed && { backgroundColor: palette.surfacePressed },
                phase !== 'idle' && { opacity: 0.5 },
              ]}
              accessibilityRole="button"
            >
              <Ionicons name={action.icon} size={13} color={palette.tint} />
              <Text style={[styles.quickText, { color: palette.text }]}>{action.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={awaiting ? 'Resolve the approvals above to continue…' : 'Ask Forge about your code…'}
          placeholderTextColor={palette.textSecondary}
          multiline
          editable={!awaiting}
          onSubmitEditing={submit}
          blurOnSubmit={false}
          style={[
            styles.input,
            {
              backgroundColor: palette.inputBg,
              borderColor: palette.border,
              color: palette.text,
            },
          ]}
          accessibilityLabel="Message Forge"
        />
        {streaming ? (
          <Pressable
            onPress={onCancel}
            style={[styles.sendButton, { backgroundColor: palette.danger }]}
            accessibilityRole="button"
            accessibilityLabel="Stop generating"
          >
            <Ionicons name="stop" size={17} color="#ffffff" />
          </Pressable>
        ) : (
          <Pressable
            onPress={submit}
            disabled={!canSend}
            style={[
              styles.sendButton,
              { backgroundColor: canSend ? palette.tint : palette.surfacePressed },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Ionicons
              name="arrow-up"
              size={17}
              color={canSend ? palette.onTint : palette.textSecondary}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 4 },
  quickRow: { gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  quickText: { fontSize: 12.5, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    maxHeight: 140,
    lineHeight: 20,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
