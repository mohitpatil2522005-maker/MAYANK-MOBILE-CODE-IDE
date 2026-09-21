/**
 * One chat message: user bubble (right), assistant markdown (left),
 * system notes (centered pill) — plus tool call cards for assistant turns.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';

import type { Palette } from '@/src/constants/theme';
import { stripStreamingToolText } from '@/src/lib/ai/tools';
import type { AgentMessage } from '@/src/store/agentStore';
import { ToolCallCard } from './ToolCallCard';

interface ChatMessageItemProps {
  message: AgentMessage;
  palette: Palette;
  busy: boolean;
  onApproveToolCall: (callId: string) => void;
  onRejectToolCall: (callId: string) => void;
}

export function ChatMessageItem({
  message,
  palette,
  busy,
  onApproveToolCall,
  onRejectToolCall,
}: ChatMessageItemProps) {
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
            {message.status === 'error' && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={13} color={palette.danger} />
                <Text style={[styles.errorHint, { color: palette.danger }]}>
                  Request failed — check provider settings and try again.
                </Text>
              </View>
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
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  errorHint: { fontSize: 12, flexShrink: 1 },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  thinkingText: { fontSize: 13, fontStyle: 'italic' },
});
