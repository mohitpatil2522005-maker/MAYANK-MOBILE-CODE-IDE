/**
 * One chat message: user bubble (right), assistant markdown (left),
 * system notes (centered pill) — plus tool call cards for assistant turns.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';

import type { Palette } from '@/src/constants/theme';
import { extractProjectFileRefs } from '@/src/lib/ai/fileRefs';
import { stripStreamingToolText } from '@/src/lib/ai/tools';
import type { FileNode } from '@/src/lib/fs/types';
import type { AgentMessage } from '@/src/store/agentStore';
import { ToolCallCard } from './ToolCallCard';

interface ChatMessageItemProps {
  message: AgentMessage;
  palette: Palette;
  busy: boolean;
  projectFiles: FileNode[];
  onOpenFile: (node: FileNode) => void;
  onApproveToolCall: (callId: string) => void;
  onRejectToolCall: (callId: string) => void;
  onRetry?: () => void;
}

export function ChatMessageItem({
  message,
  palette,
  busy,
  projectFiles,
  onOpenFile,
  onApproveToolCall,
  onRejectToolCall,
  onRetry,
}: ChatMessageItemProps) {
  const fileRefs = useMemo(
    () =>
      message.role === 'assistant' && message.status === 'complete'
        ? extractProjectFileRefs(message.content, projectFiles)
        : [],
    [message.role, message.status, message.content, projectFiles],
  );

  if (message.hidden) return null;

  if (message.role === 'note') {
    return (
      <View style={[styles.note, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Ionicons name="information-circle-outline" size={13} color={palette.textSecondary} />
        <Text style={[styles.noteText, { color: palette.textSecondary }]}>{message.content}</Text>
      </View>
    );
  }

  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={[styles.userBubble, { backgroundColor: palette.tint }]}>
          <Text style={[styles.userText, { color: palette.onTint }]}>{message.content}</Text>
        </View>
      </View>
    );
  }

  // assistant
  const streaming = message.status === 'streaming';
  const displayText = streaming ? stripStreamingToolText(message.content) : message.content;
  const thinking = streaming && displayText.trim().length === 0;

  const mdStyles = {
    body: { color: palette.text, fontSize: 14, lineHeight: 21 },
    heading1: { color: palette.text, fontSize: 20, fontWeight: '700' as const, marginVertical: 8 },
    heading2: { color: palette.text, fontSize: 17, fontWeight: '700' as const, marginVertical: 6 },
    heading3: { color: palette.text, fontSize: 15, fontWeight: '700' as const, marginVertical: 4 },
    code_inline: {
      backgroundColor: palette.surfacePressed,
      color: palette.text,
      borderRadius: 4,
      fontFamily: 'monospace' as never,
      fontSize: 12.5,
    },
    code_block: {
      backgroundColor: palette.bgSecondary,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      color: palette.text,
      fontFamily: 'monospace' as never,
      fontSize: 12,
    },
    fence: {
      backgroundColor: palette.bgSecondary,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      color: palette.text,
      fontFamily: 'monospace' as never,
      fontSize: 12,
    },
    link: { color: palette.tint },
    blockquote: {
      backgroundColor: palette.surface,
      borderLeftColor: palette.tint,
      borderLeftWidth: 3,
      paddingHorizontal: 10,
      paddingVertical: 2,
    },
    list_item: { color: palette.text, fontSize: 14, lineHeight: 21 },
    hr: { backgroundColor: palette.border },
  };

  return (
    <View style={styles.assistantRow}>
      <View
        style={[
          styles.assistantBubble,
          { backgroundColor: palette.surface, borderColor: palette.border },
          message.status === 'error' && { borderColor: palette.danger },
        ]}
      >
        {thinking ? (
          <ThinkingIndicator palette={palette} />
        ) : (
          <>
            <Markdown style={mdStyles}>{displayText + (streaming ? ' ▌' : '')}</Markdown>
            {message.status === 'cancelled' && (
              <Text style={[styles.stateHint, { color: palette.textSecondary }]}>— cancelled</Text>
            )}
            {message.status === 'error' && onRetry && (
              <Pressable
                onPress={onRetry}
                disabled={busy}
                style={({ pressed }) => [
                  styles.retryButton,
                  { borderColor: palette.tint },
                  (pressed || busy) && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Retry request"
              >
                <Ionicons name="refresh" size={13} color={palette.tint} />
                <Text style={[styles.retryText, { color: palette.tint }]}>Retry</Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      {message.toolCalls?.map((call) => (
        <ToolCallCard
          key={call.callId}
          call={call}
          palette={palette}
          disabled={busy}
          onApprove={() => onApproveToolCall(call.callId)}
          onReject={() => onRejectToolCall(call.callId)}
        />
      ))}

      {/* Phase 5 bridge: open files the agent mentioned directly in the editor. */}
      {message.status === 'complete' && fileRefs.length > 0 && (
        <View style={styles.fileRefsRow}>
          <Ionicons name="open-outline" size={12} color={palette.textSecondary} />
          {fileRefs.map((node) => (
            <Pressable
              key={node.uri}
              onPress={() => onOpenFile(node)}
              style={({ pressed }) => [
                styles.fileRefChip,
                { borderColor: palette.border, backgroundColor: palette.surface },
                pressed && { backgroundColor: palette.surfacePressed },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${node.path} in editor`}
            >
              <Ionicons name="document-text-outline" size={12} color={palette.tint} />
              <Text style={[styles.fileRefText, { color: palette.tint }]} numberOfLines={1}>
                {node.path}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function ThinkingIndicator({ palette }: { palette: Palette }) {
  return (
    <View style={styles.thinkingRow}>
      <Ionicons name="sparkles" size={13} color={palette.tint} />
      <Text style={[styles.thinkingText, { color: palette.textSecondary }]}>
        Forge is thinking…
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginVertical: 4,
    maxWidth: '92%',
  },
  noteText: { fontSize: 12, lineHeight: 16, flexShrink: 1 },
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginVertical: 4 },
  userBubble: {
    borderRadius: 14,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '85%',
  },
  userText: { fontSize: 14, lineHeight: 20 },
  assistantRow: { marginVertical: 4, alignSelf: 'stretch' },
  assistantBubble: {
    borderWidth: 1,
    borderRadius: 14,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '94%',
  },
  stateHint: { fontSize: 12, marginTop: 6 },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
  },
  retryText: { fontSize: 12.5, fontWeight: '700' },
  fileRefsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  fileRefChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    maxWidth: 240,
  },
  fileRefText: { fontSize: 11.5, fontWeight: '600', flexShrink: 1 },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  thinkingText: { fontSize: 13, fontStyle: 'italic' },
});
