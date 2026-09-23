/**
 * Source-Control panel (Slice 4, §6.4 of the masterprompt).
 *
 * Three-group tree (staged / unstaged / untracked) with per-file diff-stat
 * chips, stage/unstage toggles, and a commit composer with validation.
 * Data comes from the SCM store; in the MVP it is populated from the
 * project's open-file dirty tracking (a real isomorphic-git adapter is a
 * later milestone).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Palette } from '@/src/constants/theme';
import {
  commitTypePrefix,
  diffStatLabel,
  totalDiffStats,
  validateCommitMessage,
  type GitFileEntry,
} from '@/src/lib/git/scm';
import { tapLight } from '@/src/lib/haptics';
import { useProjectStore } from '@/src/store/projectStore';
import { scmGroups, useScmStore } from '@/src/store/scmStore';

export function ScmSheet({
  visible,
  palette,
  onClose,
}: {
  visible: boolean;
  palette: Palette;
  onClose: () => void;
}) {
  const status = useScmStore((s) => s.status);
  const commitMessage = useScmStore((s) => s.commitMessage);
  const stage = useScmStore((s) => s.stage);
  const unstage = useScmStore((s) => s.unstage);
  const setCommitMessage = useScmStore((s) => s.setCommitMessage);
  const commit = useScmStore((s) => s.commit);
  const refresh = useScmStore((s) => s.refreshFromProject);

  const openFile = useProjectStore((s) => s.openFile);
  const activateFile = useProjectStore((s) => s.activateFile);

  const [showUnstaged, setShowUnstaged] = useState(true);
  const [showUntracked, setShowUntracked] = useState(true);

  // Rebuild the file list from the project on open.
  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  const groups = scmGroups();
  const stagedStats = totalDiffStats(groups.staged);
  const validation = validateCommitMessage(commitMessage);
  const canCommit = validation.ok && groups.staged.length > 0;
  const prefix = commitTypePrefix(commitMessage);

  const openDiff = (f: GitFileEntry) => {
    tapLight();
    const open = useProjectStore.getState().openFiles.find((x) => x.path === f.path);
    if (open) activateFile(open.uri);
    else {
      const node = findNode(useProjectStore.getState().tree, f.path);
      if (node) void openFile(node);
    }
  };

  const doCommit = () => {
    if (!canCommit) {
      if (!validation.ok) {
        Alert.alert('Commit', validation.error ?? 'Cannot commit yet');
      } else {
        Alert.alert('Commit', 'Stage at least one file before committing.');
      }
      return;
    }
    commit();
    refresh();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: palette.bgSecondary, borderTopColor: palette.border }]}>
        {/* Header */}
        <View style={[styles.header, { borderColor: palette.border }]}>
          <Ionicons name="git-branch" size={18} color={palette.tint} />
          <Text style={[styles.headerBranch, { color: palette.text }]}>
            {status.branch}
            {status.ahead > 0 && ` ↑${status.ahead}`}
            {status.behind > 0 && ` ↓${status.behind}`}
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && { backgroundColor: palette.surfacePressed }]}
            accessibilityRole="button"
            accessibilityLabel="Close source control"
          >
            <Ionicons name="close" size={20} color={palette.text} />
          </Pressable>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner}>
          {/* Commit composer */}
          <View style={[styles.composer, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <TextInput
              value={commitMessage}
              onChangeText={setCommitMessage}
              placeholder="Commit message (e.g. feat: add source control)"
              placeholderTextColor={palette.textSecondary}
              style={[styles.composerInput, { color: palette.text }]}
              autoCapitalize="sentences"
              accessibilityLabel="Commit message"
            />
            <View style={styles.composerFooter}>
              {prefix ? (
                <View style={[styles.prefixChip, { backgroundColor: palette.tint + '22' }]}>
                  <Text style={[styles.prefixText, { color: palette.tint }]}>{prefix}</Text>
                </View>
              ) : null}
              <Text style={[styles.composerCount, { color: palette.textSecondary }]}>
                {stagedStats.count > 0 ? `${stagedStats.count} staged` : 'nothing staged'}
              </Text>
              <Pressable
                onPress={doCommit}
                disabled={!canCommit}
                style={({ pressed }) => [
                  styles.commitBtn,
                  { backgroundColor: canCommit ? palette.tint : palette.surfacePressed },
                  pressed && canCommit && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Commit staged changes"
              >
                <Ionicons name="git-commit" size={15} color={palette.onTint} />
                <Text style={[styles.commitText, { color: palette.onTint }]}>Commit</Text>
              </Pressable>
            </View>
          </View>

          {/* Staged */}
          <ScmGroup
            palette={palette}
            title={`Staged (${groups.staged.length})`}
            files={groups.staged}
            actionLabel="Unstage"
            onAction={unstage}
            onOpen={openDiff}
            expanded
            setExpanded={() => undefined}
          />

          {/* Unstaged */}
          <ScmGroup
            palette={palette}
            title={`Changes (${groups.unstaged.length})`}
            files={groups.unstaged}
            actionLabel="Stage"
            onAction={stage}
            onOpen={openDiff}
            expanded={showUnstaged}
            setExpanded={setShowUnstaged}
          />

          {/* Untracked */}
          {groups.untracked.length > 0 && (
            <ScmGroup
              palette={palette}
              title={`Untracked (${groups.untracked.length})`}
              files={groups.untracked}
              actionLabel="Stage"
              onAction={stage}
              onOpen={openDiff}
              expanded={showUntracked}
              setExpanded={setShowUntracked}
            />
          )}

          {status.files.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="checkmark-done" size={30} color={palette.success} />
              <Text style={[styles.emptyText, { color: palette.text }]}>Working tree clean</Text>
              <Text style={[styles.emptySub, { color: palette.textSecondary }]}>
                No modified, added, or untracked files.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ScmGroup({
  palette,
  title,
  files,
  actionLabel,
  onAction,
  onOpen,
  expanded,
  setExpanded,
}: {
  palette: Palette;
  title: string;
  files: GitFileEntry[];
  actionLabel: string;
  onAction: (path: string) => void;
  onOpen: (f: GitFileEntry) => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}) {
  return (
    <View>
      <Pressable
        onPress={() => {
          tapLight();
          setExpanded(!expanded);
        }}
        style={({ pressed }) => [
          styles.groupHeader,
          { backgroundColor: pressed ? palette.surfacePressed : palette.bg },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${expanded ? 'collapse' : 'expand'}`}
      >
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={14}
          color={palette.textSecondary}
        />
        <Text style={[styles.groupTitle, { color: palette.text }]}>{title}</Text>
      </Pressable>
      {expanded &&
        files.map((f) => {
          const stat = diffStatLabel(f);
          return (
            <View
              key={f.path}
              style={[styles.fileRow, { borderColor: palette.border, backgroundColor: palette.bg }]}
            >
              <Ionicons name="document-outline" size={14} color={palette.textSecondary} />
              <Pressable
                style={styles.fileLabelWrap}
                onPress={() => onOpen(f)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${f.path}`}
              >
                <Text numberOfLines={1} style={[styles.fileLabel, { color: palette.text }]}>
                  {f.path}
                </Text>
              </Pressable>
              {stat ? <Text style={[styles.fileStat, { color: palette.success }]}>{stat}</Text> : null}
              <Text style={[styles.fileStatus, { color: palette.tint }]}>{f.status.toUpperCase()}</Text>
              <Pressable
                onPress={() => {
                  tapLight();
                  onAction(f.path);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`${actionLabel} ${f.path}`}
              >
                <Ionicons name="add-circle-outline" size={16} color={palette.tint} />
              </Pressable>
            </View>
          );
        })}
      {expanded && files.length === 0 && (
        <Text style={[styles.groupEmpty, { color: palette.textSecondary, marginLeft: 24 }]}>—</Text>
      )}
    </View>
  );
}

function findNode(
  nodes: import('@/src/lib/fs/types').FileNode[],
  path: string,
): import('@/src/lib/fs/types').FileNode | null {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.children) {
      const r = findNode(n.children, path);
      if (r) return r;
    }
  }
  return null;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    flex: 1,
    marginTop: '12%',
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
  headerBranch: { fontSize: 15, fontWeight: '700', flex: 1 },
  closeBtn: { padding: 4, borderRadius: 8 },
  body: { flex: 1 },
  bodyInner: { padding: 12, gap: 12, paddingBottom: 40 },
  composer: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  composerInput: { fontSize: 13.5, minHeight: 36 },
  composerFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prefixChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  prefixText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  composerCount: { fontSize: 11.5, flex: 1 },
  commitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  commitText: { fontSize: 12.5, fontWeight: '700' },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  groupTitle: { fontSize: 13, fontWeight: '700' },
  groupEmpty: { fontSize: 12, paddingVertical: 4 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 4,
    marginVertical: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fileLabelWrap: { flex: 1, minWidth: 0 },
  fileLabel: { fontSize: 12.5 },
  fileStat: { fontSize: 11, fontWeight: '600' },
  fileStatus: { fontSize: 10, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 6, marginTop: 20 },
  emptyText: { fontSize: 15, fontWeight: '700' },
  emptySub: { fontSize: 12, textAlign: 'center' },
});
