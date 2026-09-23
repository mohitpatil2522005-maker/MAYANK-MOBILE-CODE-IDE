/**
 * Review Changes sheet (Slice 2, §9.10 of the masterprompt).
 *
 * Lists the checkpoint ring (newest first) with reason, author, timestamp,
 * and per-file diff stats. Selecting a checkpoint shows the diff against
 * the current open tabs and offers: Revert (pre-revert snapshot kept so the
 * action is reversible), "Open file" to jump to a changed tab, and a
 * "New checkpoint now" action.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Palette } from '@/src/constants/theme';
import { tapLight } from '@/src/lib/haptics';
import { diffLineStats, type CheckpointDiff } from '@/src/lib/editor/checkpoint';
import { useCheckpointStore } from '@/src/store/checkpointStore';
import { useProjectStore } from '@/src/store/projectStore';

export function ReviewChangesSheet({
  visible,
  palette,
  onClose,
}: {
  visible: boolean;
  palette: Palette;
  onClose: () => void;
}) {
  const checkpoints = useCheckpointStore((s) => s.checkpoints);
  const diffAgainstCurrent = useCheckpointStore((s) => s.diffAgainstCurrent);
  const revertTo = useCheckpointStore((s) => s.revertTo);
  const snapshotOpenTabs = useCheckpointStore((s) => s.snapshotOpenTabs);
  const openFile = useProjectStore((s) => s.openFile);
  const activateFile = useProjectStore((s) => s.activateFile);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revertNote, setRevertNote] = useState<string | null>(null);

  const ordered = useMemo(() => [...checkpoints].reverse(), [checkpoints]);
  const selected = checkpoints.find((c) => c.id === selectedId) ?? null;
  const selectedDiffs: CheckpointDiff[] = selected ? diffAgainstCurrent(selected.id) : [];

  const onRevert = () => {
    if (!selected) return;
    tapLight();
    revertTo(selected.id);
    setRevertNote(
      `Reverted to "${selected.reason}". The pre-revert state is kept as a new checkpoint — undo it from this sheet if you change your mind.`,
    );
    setTimeout(() => setRevertNote(null), 6000);
  };

  const onOpenDiffFile = (path: string) => {
    tapLight();
    const open = useProjectStore.getState().openFiles.find((f) => f.path === path);
    if (open) {
      activateFile(open.uri);
      return;
    }
    // Fall back: locate the node in the tree and open it.
    const nodes = useProjectStore.getState().tree;
    const findNode = (ns: typeof nodes): (typeof ns)[number] | null => {
      for (const n of ns) {
        if (n.path === path) return n;
        if (n.children) {
          const r = findNode(n.children);
          if (r) return r;
        }
      }
      return null;
    };
    const node = findNode(nodes);
    if (node) void openFile(node);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: palette.bgSecondary, borderTopColor: palette.border }]}>
        {/* Header */}
        <View style={[styles.header, { borderColor: palette.border }]}>
          <Ionicons name="git-branch" size={18} color={palette.tint} />
          <Text style={[styles.headerTitle, { color: palette.text }]}>Review Changes</Text>
          <Pressable
            onPress={() => {
              tapLight();
              snapshotOpenTabs('manual checkpoint');
            }}
            style={({ pressed }) => [
              styles.newBtn,
              { borderColor: palette.tint },
              pressed && { backgroundColor: palette.surfacePressed },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Create checkpoint now"
          >
            <Ionicons name="add-circle-outline" size={16} color={palette.tint} />
            <Text style={[styles.newBtnText, { color: palette.tint }]}>Checkpoint</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && { backgroundColor: palette.surfacePressed }]}
            accessibilityRole="button"
            accessibilityLabel="Close review"
          >
            <Ionicons name="close" size={20} color={palette.text} />
          </Pressable>
        </View>

        {revertNote && (
          <View
            style={[
              styles.note,
              { backgroundColor: palette.tint + '22', borderColor: palette.tint },
            ]}
          >
            <Ionicons name="checkmark-circle" size={16} color={palette.tint} />
            <Text style={[styles.noteText, { color: palette.text }]}>{revertNote}</Text>
          </View>
        )}

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner}>
          {ordered.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={32} color={palette.textSecondary} />
              <Text style={[styles.emptyTitle, { color: palette.text }]}>No checkpoints yet</Text>
              <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
                Checkpoints are created automatically before agent writes, or tap "Checkpoint" above to
                snapshot the current editor state.
              </Text>
            </View>
          )}

          {ordered.map((cp) => {
            const isSelected = cp.id === selectedId;
            const diffs = isSelected ? selectedDiffs : [];
            const fileCount = Object.keys(cp.files).length;
            return (
              <View key={cp.id}>
                <Pressable
                  onPress={() => {
                    tapLight();
                    setSelectedId(isSelected ? null : cp.id);
                  }}
                  style={({ pressed }) => [
                    styles.cpCard,
                    {
                      borderColor: isSelected ? palette.tint : palette.border,
                      backgroundColor: isSelected ? palette.tint + '1a' : palette.surface,
                    },
                    pressed && { backgroundColor: palette.surfacePressed },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Checkpoint: ${cp.reason}`}
                >
                  <View style={styles.cpTop}>
                    <Ionicons
                      name={
                        cp.author === 'agent'
                          ? 'sparkles'
                          : cp.author === 'scm'
                            ? 'git-commit'
                            : 'person'
                      }
                      size={14}
                      color={palette.tint}
                    />
                    <Text numberOfLines={2} style={[styles.cpReason, { color: palette.text }]}>
                      {cp.reason}
                    </Text>
                  </View>
                  <Text style={[styles.cpMeta, { color: palette.textSecondary }]}>
                    {new Date(cp.ts).toLocaleString()} · {fileCount} file{fileCount === 1 ? '' : 's'} ·{' '}
                    {cp.author}
                  </Text>

                  {isSelected && diffs.length > 0 && (
                    <View style={styles.diffList}>
                      {diffs.map((d) => {
                        const stats = diffLineStats(d);
                        return (
                          <Pressable
                            key={d.path}
                            onPress={() => onOpenDiffFile(d.path)}
                            style={({ pressed }) => [
                              styles.diffRow,
                              { borderColor: palette.border },
                              pressed && { backgroundColor: palette.surfacePressed },
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${d.path}`}
                          >
                            <Text numberOfLines={1} style={[styles.diffPath, { color: palette.text }]}>
                              {d.path}
                            </Text>
                            <View style={styles.diffStats}>
                              <Text style={{ color: palette.success, fontSize: 11 }}>+{stats.added}</Text>
                              <Text style={{ color: palette.danger, fontSize: 11, marginLeft: 6 }}>
                                −{stats.removed}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                      <Pressable
                        onPress={onRevert}
                        style={({ pressed }) => [
                          styles.revertBtn,
                          { backgroundColor: palette.danger + '22' },
                          pressed && { opacity: 0.8 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Revert to this checkpoint"
                      >
                        <Ionicons name="arrow-undo-outline" size={14} color={palette.danger} />
                        <Text style={[styles.revertText, { color: palette.danger }]}>
                          Revert to this checkpoint
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    flex: 1,
    marginTop: '18%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  newBtnText: { fontSize: 12, fontWeight: '600' },
  closeBtn: { padding: 4, borderRadius: 8 },
  body: { flex: 1 },
  bodyInner: { padding: 12, gap: 10, paddingBottom: 40 },
  empty: { alignItems: 'center', gap: 8, marginTop: 40, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyText: { fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  noteText: { fontSize: 12, flex: 1, lineHeight: 17 },
  cpCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  cpTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cpReason: { fontSize: 13, fontWeight: '600', flex: 1 },
  cpMeta: { fontSize: 11 },
  diffList: { gap: 6, marginTop: 4 },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  diffPath: { fontSize: 12, flex: 1, marginRight: 8 },
  diffStats: { flexDirection: 'row' },
  revertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  revertText: { fontSize: 12.5, fontWeight: '700' },
});
