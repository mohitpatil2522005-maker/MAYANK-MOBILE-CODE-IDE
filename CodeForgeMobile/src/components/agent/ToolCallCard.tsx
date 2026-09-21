/**
 * Renders one agent tool call inside the chat: status, result preview for
 * read-only tools, and diff preview + Approve/Reject for writes (agent.md §7).
 * Writes are NEVER applied without the Approve tap.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Palette } from '@/src/constants/theme';
import { collapseContext } from '@/src/lib/diff';
import type { ToolCallState } from '@/src/store/agentStore';

interface ToolCallCardProps {
  call: ToolCallState;
  palette: Palette;
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
}

const TOOL_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  read_file: 'book-outline',
  write_file: 'document-outline',
  edit_file: 'create-outline',
  list_files: 'list-outline',
  search_code: 'search-outline',
  explain_selection: 'help-circle-outline',
};

const STATUS_STYLE: Record<
  string,
  { label: string; colorKey: 'tint' | 'success' | 'danger' | 'warning' | 'textSecondary' }
> = {
  running: { label: 'Running…', colorKey: 'tint' },
  executed: { label: 'Done', colorKey: 'success' },
  'pending-approval': { label: 'Needs approval', colorKey: 'warning' },
  rejected: { label: 'Rejected', colorKey: 'textSecondary' },
  applied: { label: 'Applied', colorKey: 'success' },
  failed: { label: 'Failed', colorKey: 'danger' },
};

function argSummary(call: ToolCallState): string {
  const path = call.args.path;
  if (typeof path === 'string' && path) return path;
  const pattern = call.args.pattern;
  if (typeof pattern === 'string' && pattern) return `"${pattern}"`;
  return '';
}

export function ToolCallCard({ call, palette, disabled, onApprove, onReject }: ToolCallCardProps) {
  const status = STATUS_STYLE[call.status] ?? STATUS_STYLE.running;
  const icon = TOOL_ICONS[call.tool] ?? 'construct-outline';
  const previewLines = call.preview?.diff ? collapseContext(call.preview.diff.lines) : null;
  const isNewFile = call.preview?.kind === 'new-file';

  return (
    <View style={[styles.card, { backgroundColor: palette.bgSecondary, borderColor: palette.border }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Ionicons name={icon} size={15} color={palette.tint} />
        <Text style={[styles.toolName, { color: palette.text }]} numberOfLines={1}>
          {call.tool}
        </Text>
        {argSummary(call) !== '' && (
          <Text style={[styles.argText, { color: palette.textSecondary }]} numberOfLines={1}>
            {argSummary(call)}
          </Text>
        )}
        <View style={[styles.statusChip, { borderColor: palette[status.colorKey] }]}>
          <Text style={[styles.statusText, { color: palette[status.colorKey] }]}>{status.label}</Text>
        </View>
      </View>

      {call.summary && call.status !== 'pending-approval' && (
        <Text style={[styles.summary, { color: palette.textSecondary }]} numberOfLines={2}>
          {call.summary}
        </Text>
      )}

      {/* Read-only result preview */}
      {call.resultPreview && call.status === 'executed' && (
        <View style={[styles.resultBox, { borderColor: palette.border, backgroundColor: palette.bg }]}>
          <Text style={[styles.resultText, { color: palette.textSecondary }]} numberOfLines={8}>
            {call.resultPreview}
          </Text>
        </View>
      )}

      {/* Diff preview for pending writes */}
      {call.status === 'pending-approval' && previewLines && (
        <View style={[styles.diffBox, { borderColor: palette.border, backgroundColor: palette.bg }]}>
          {previewLines.map((line, idx) => {
            const bg =
              line.type === 'add'
                ? palette.dark
                  ? 'rgba(63,185,80,0.15)'
                  : 'rgba(26,127,55,0.12)'
                : line.type === 'remove'
                  ? palette.dark
                    ? 'rgba(248,81,73,0.15)'
                    : 'rgba(209,36,47,0.10)'
                  : 'transparent';
            const fg =
              line.type === 'add' ? palette.success : line.type === 'remove' ? palette.danger : palette.textSecondary;
            const prefix = line.type === 'add' ? '+ ' : line.type === 'remove' ? '− ' : '  ';
            return (
              <Text key={idx} numberOfLines={1} style={[styles.diffLine, { backgroundColor: bg, color: fg }]}>
                {prefix}
                {line.text}
              </Text>
            );
          })}
        </View>
      )}

      {/* New file preview */}
      {call.status === 'pending-approval' && isNewFile && (
        <View style={[styles.resultBox, { borderColor: palette.border, backgroundColor: palette.bg }]}>
          <Text style={[styles.resultText, { color: palette.text }]} numberOfLines={12}>
            {call.preview?.newContentPreview}
          </Text>
        </View>
      )}

      {/* Conflict warning */}
      {call.status === 'pending-approval' && call.preview?.conflictsWithOpenTab && (
        <View style={styles.warnRow}>
          <Ionicons name="warning-outline" size={13} color={palette.warning} />
          <Text style={[styles.warnText, { color: palette.warning }]}>
            This file has unsaved changes in the editor — approving will overwrite them.
          </Text>
        </View>
      )}

      {/* Error */}
      {call.status === 'failed' && call.error && (
        <Text style={[styles.errorText, { color: palette.danger }]} numberOfLines={3}>
          {call.error}
        </Text>
      )}

      {/* Approve / Reject */}
      {call.status === 'pending-approval' && (
        <View style={styles.actionsRow}>
          <Pressable
            onPress={onApprove}
            disabled={disabled}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: palette.success },
              (pressed || disabled) && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Approve change"
          >
            <Ionicons name="checkmark" size={15} color="#ffffff" />
            <Text style={styles.actionText}>Approve</Text>
          </Pressable>
          <Pressable
            onPress={onReject}
            disabled={disabled}
            style={({ pressed }) => [
              styles.actionButton,
              styles.rejectButton,
              { borderColor: palette.danger },
              (pressed || disabled) && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Reject change"
          >
            <Ionicons name="close" size={15} color={palette.danger} />
            <Text style={[styles.actionText, { color: palette.danger }]}>Reject</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolName: { fontSize: 13, fontWeight: '700' },
  argText: { fontSize: 12, flexShrink: 1, fontFamily: 'monospace' as never },
  statusChip: {
    marginLeft: 'auto',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusText: { fontSize: 10.5, fontWeight: '700' },
  summary: { fontSize: 12, lineHeight: 16 },
  resultBox: { borderWidth: 1, borderRadius: 8, padding: 8 },
  resultText: { fontSize: 11.5, fontFamily: 'monospace' as never, lineHeight: 16 },
  diffBox: { borderWidth: 1, borderRadius: 8, paddingVertical: 4, overflow: 'hidden' },
  diffLine: {
    fontSize: 11.5,
    fontFamily: 'monospace' as never,
    lineHeight: 17,
    paddingHorizontal: 6,
  },
  warnRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  warnText: { fontSize: 11.5, flex: 1, lineHeight: 16 },
  errorText: { fontSize: 12, lineHeight: 16 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rejectButton: { backgroundColor: 'transparent', borderWidth: 1 },
  actionText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
});
