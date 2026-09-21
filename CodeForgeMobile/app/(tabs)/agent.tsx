/**
 * Agent tab — Forge chat (Phase 3).
 * Streaming chat with markdown, read-only tools that auto-execute, and
 * write/edit proposals gated behind Approve/Reject diff cards.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatMessageItem } from '@/src/components/agent/ChatMessageItem';
import { Composer, type QuickAction } from '@/src/components/agent/Composer';
import { ModelPickerModal } from '@/src/components/agent/ModelPickerModal';
import { usePalette } from '@/src/constants/theme';
import { estimateTokens } from '@/src/lib/ai/agent';
import { useProviderRegistry } from '@/src/lib/ai/registry';
import { agentTargetLabel, useAgentStore } from '@/src/store/agentStore';
import { allProjectFiles, useProjectStore } from '@/src/store/projectStore';

export default function AgentScreen() {
  const palette = usePalette();

  const providers = useProviderRegistry((s) => s.providers);
  const hydrated = useProviderRegistry((s) => s.hydrated);

  const messages = useAgentStore((s) => s.messages);
  const phase = useAgentStore((s) => s.phase);
  const sendMessage = useAgentStore((s) => s.sendMessage);
  const cancelRun = useAgentStore((s) => s.cancelRun);
  const newChat = useAgentStore((s) => s.newChat);
  const approveToolCall = useAgentStore((s) => s.approveToolCall);
  const rejectToolCall = useAgentStore((s) => s.rejectToolCall);
  const retryLast = useAgentStore((s) => s.retryLast);

  const projectName = useProjectStore((s) => s.projectName);
  const tree = useProjectStore((s) => s.tree);
  const activeUri = useProjectStore((s) => s.activeUri);
  const openFiles = useProjectStore((s) => s.openFiles);
  const selection = useProjectStore((s) => s.selection);
  const openFile = useProjectStore((s) => s.openFile);
  const activeFile = openFiles.find((f) => f.uri === activeUri) ?? null;
  const projectFiles = useMemo(() => allProjectFiles(tree), [tree]);

  const sessionTokens = useMemo(
    () => messages.reduce((sum, m) => sum + estimateTokens(m.content), 0),
    [messages],
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  // subscribe for label reactivity
  useProviderRegistry((s) => s.defaultProviderId);
  useAgentStore((s) => s.activeProviderId);
  useAgentStore((s) => s.activeModel);
  const targetLabel = agentTargetLabel();

  const listRef = useRef<FlatList>(null);
  useEffect(() => {
    if (messages.length > 0) {
      const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [messages.length, messages[messages.length - 1]?.content]);

  const hasProvider = providers.length > 0;

  const handleQuickAction = (action: QuickAction) => {
    const prompts: Record<QuickAction, string> = {
      explain: `Explain this file to me: what it does, how it works, and anything noteworthy.`,
      'explain-selection': `Explain the code I have selected in the editor.`,
      fix: `Look at this file and find any bugs or issues. Propose fixes with edit_file — read it first to get exact text.`,
      refactor: `Suggest and apply a focused refactor of this file (naming, structure, duplication). Read it first, then propose edits.`,
      comments: `Add clear, concise doc comments to the functions in this file. Read it first, then apply edits.`,
    };
    void sendMessage(prompts[action]);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.bgSecondary, borderColor: palette.border }]}>
        <Ionicons name="sparkles" size={17} color={palette.tint} />
        <Text style={[styles.headerTitle, { color: palette.text }]}>Forge Agent</Text>
        {projectName && (
          <Text numberOfLines={1} style={[styles.headerContext, { color: palette.textSecondary }]}>
            {projectName}
            {activeFile ? ` · ${activeFile.path}` : ''}
          </Text>
        )}
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [
              styles.modelButton,
              { borderColor: palette.border },
              pressed && { backgroundColor: palette.surfacePressed },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Choose provider and model"
          >
            <Ionicons name="hardware-chip-outline" size={13} color={palette.tint} />
            <Text numberOfLines={1} style={[styles.modelButtonText, { color: palette.text }]}>
              {targetLabel}
            </Text>
          </Pressable>
          {messages.length > 0 && (
            <Pressable
              onPress={newChat}
              style={({ pressed }) => [
                styles.iconButton,
                pressed && { backgroundColor: palette.surfacePressed },
              ]}
              accessibilityRole="button"
              accessibilityLabel="New chat"
            >
              <Ionicons name="add" size={20} color={palette.text} />
            </Pressable>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {!hydrated ? null : !hasProvider ? (
          // No provider configured — guide to setup.
          <View style={styles.emptyState}>
            <Ionicons name="key-outline" size={40} color={palette.tint} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>Connect an AI provider</Text>
            <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
              Forge works with your own API keys — OpenAI, Anthropic, Google, Groq, or any
              OpenAI-compatible endpoint (Ollama, LM Studio, vLLM). Keys stay in the OS keychain.
            </Text>
            <Pressable
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [
                styles.setupButton,
                { backgroundColor: palette.tint },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="settings-outline" size={16} color={palette.onTint} />
              <Text style={[styles.setupButtonText, { color: palette.onTint }]}>
                Set up a provider
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => (
                <ChatMessageItem
                  message={item}
                  palette={palette}
                  busy={phase === 'streaming'}
                  projectFiles={projectFiles}
                  onOpenFile={(node) => {
                    void openFile(node);
                    router.push('/');
                  }}
                  onApproveToolCall={(callId) => void approveToolCall(item.id, callId)}
                  onRejectToolCall={(callId) => rejectToolCall(item.id, callId)}
                  onRetry={item.status === 'error' ? () => void retryLast() : undefined}
                />
              )}
              contentContainerStyle={[styles.chatContent, messages.length === 0 && styles.chatEmpty]}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.chatEmptyInner}>
                  <Ionicons name="chatbubbles-outline" size={36} color={palette.textSecondary} />
                  <Text style={[styles.emptyTitle, { color: palette.text }]}>
                    Ask anything about your code
                  </Text>
                  <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
                    {activeFile
                      ? `Forge can see "${activeFile.path}"${
                          selection ? ' and your selection' : ''
                        } — try a quick action below, or ask it to read other files.`
                      : 'Open a file in the Editor tab to give Forge context, or just ask a question.'}
                  </Text>
                </View>
              }
            />

            {/* Session status strip */}
            {messages.length > 0 && (
              <Text style={[styles.statusStrip, { color: palette.textSecondary }]}>
                {messages.filter((m) => !m.hidden).length} messages · ≈
                {sessionTokens.toLocaleString()} tokens
                {phase === 'awaiting-approval' ? ' · waiting for your approvals' : ''}
                {phase === 'streaming' ? ' · streaming…' : ''}
              </Text>
            )}

            <Composer
              palette={palette}
              phase={phase}
              hasActiveFile={!!activeFile}
              hasSelection={!!selection}
              onSend={(text) => void sendMessage(text)}
              onCancel={cancelRun}
              onQuickAction={handleQuickAction}
            />
          </>
        )}
      </KeyboardAvoidingView>

      <ModelPickerModal visible={pickerOpen} palette={palette} onClose={() => setPickerOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 15.5, fontWeight: '700' },
  headerContext: { fontSize: 11.5, flexShrink: 1 },
  headerActions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 },
  modelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 210,
  },
  modelButtonText: { fontSize: 11.5, fontWeight: '600', flexShrink: 1 },
  iconButton: { padding: 5, borderRadius: 8 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyText: { fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
  setupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 6,
  },
  setupButtonText: { fontSize: 14.5, fontWeight: '700' },
  chatContent: { paddingHorizontal: 12, paddingVertical: 10, flexGrow: 1 },
  chatEmpty: { justifyContent: 'center' },
  chatEmptyInner: { alignItems: 'center', gap: 10, paddingHorizontal: 30 },
  statusStrip: {
    fontSize: 11,
    textAlign: 'center',
    paddingTop: 6,
    paddingBottom: 0,
  },
});
