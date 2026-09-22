/**
 * VS Code-style Command Palette / Quick Open (Phase 1.2).
 *
 * - Files mode (default): fuzzy-ranks project files by path.
 * - Commands mode (`>` prefix): fuzzy-ranks registered commands.
 * Enter picks the top result; tapping a row picks that one.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { usePalette } from '@/src/constants/theme';
import type { FileNode } from '@/src/lib/fs/types';
import { tapLight } from '@/src/lib/haptics';
import { rankItems } from '@/src/lib/search/fuzzy';

export interface PaletteCommand {
  id: string;
  title: string;
  /** Secondary line (shortcut hint or description). */
  hint?: string;
  keywords?: string;
  icon: keyof typeof Ionicons.glyphMap;
  run: () => void;
}

export interface CommandPaletteProps {
  visible: boolean;
  onClose: () => void;
  /** Project files (flat, from allProjectFiles). */
  files: FileNode[];
  onOpenFile: (node: FileNode) => void;
  dirtyUris?: ReadonlySet<string>;
  commands: PaletteCommand[];
  /** Prefill (e.g. ">" for command mode from Cmd+Shift+P). */
  initialQuery?: string;
}

type Row =
  | { kind: 'file'; ranked: import('@/src/lib/search/fuzzy').Ranked<FileNode> }
  | { kind: 'command'; ranked: import('@/src/lib/search/fuzzy').Ranked<PaletteCommand> };

export function CommandPalette({
  visible,
  onClose,
  files,
  onOpenFile,
  dirtyUris,
  commands,
  initialQuery = '',
}: CommandPaletteProps) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setQuery(initialQuery);
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [visible, initialQuery]);

  const commandMode = query.startsWith('>');
  const stripped = commandMode ? query.replace(/^>\s*/, '') : query;

  const fileResults = useMemo(
    () => (commandMode ? [] : rankItems(stripped, files, (f) => f.path, 50)),
    [commandMode, stripped, files],
  );
  const commandResults = useMemo(
    () =>
      commandMode
        ? rankItems(stripped, commands, (c) => `${c.title} ${c.keywords ?? ''}`, 30)
        : [],
    [commandMode, stripped, commands],
  );

  const total = commandMode ? commandResults.length : fileResults.length;

  // FlatList needs a single row type — normalize both modes into one union.
  const rows: Row[] = commandMode
    ? commandResults.map((ranked) => ({ kind: 'command' as const, ranked }))
    : fileResults.map((ranked) => ({ kind: 'file' as const, ranked }));

  const pickRow = (index: number) => {
    const row = rows[index];
    if (!row) return;
    tapLight();
    onClose();
    if (row.kind === 'command') row.ranked.item.run();
    else onOpenFile(row.ranked.item);
  };

  const pick = () => pickRow(0);

  const columns = width >= 768 ? 520 : Math.min(width - 24, 480);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.card,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              width: columns,
            },
          ]}
          onPress={() => undefined}
        >
          {/* Input row */}
          <View style={[styles.inputRow, { borderColor: palette.border }]}>
            <Ionicons
              name={commandMode ? 'chevron-forward' : 'search'}
              size={15}
              color={commandMode ? palette.tint : palette.textSecondary}
            />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={pick}
              placeholder={commandMode ? 'Type a command…' : 'Go to file…  (> for commands)'}
              placeholderTextColor={palette.textSecondary}
              style={[styles.input, { color: palette.text }]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              accessibilityLabel={commandMode ? 'Command search' : 'File search'}
            />
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close palette">
              <Ionicons name="close" size={16} color={palette.textSecondary} />
            </Pressable>
          </View>

          {/* Results */}
          {total === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
                {stripped
                  ? commandMode
                    ? `No commands matching “${stripped}”`
                    : `No files matching “${stripped}”`
                  : commandMode
                    ? 'No commands available'
                    : files.length === 0
                      ? 'Open a project to search its files'
                      : 'No files'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(row, i) =>
                row.kind === 'command' ? `cmd:${row.ranked.item.id}` : `file:${row.ranked.item.uri}`
              }
              keyboardShouldPersistTaps="always"
              style={styles.list}
              renderItem={({ item: row, index }) =>
                row.kind === 'command' ? (
                  <CommandRow
                    palette={palette}
                    command={row.ranked.item}
                    top={index === 0}
                    onPress={() => pickRow(index)}
                  />
                ) : (
                  <FileRow
                    palette={palette}
                    node={row.ranked.item}
                    dirty={dirtyUris?.has(row.ranked.item.uri) ?? false}
                    top={index === 0}
                    onPress={() => pickRow(index)}
                  />
                )
              }
            />
          )}

          {/* Footer hint */}
          <View style={[styles.footer, { borderColor: palette.border }]}>
            <Text style={[styles.footerText, { color: palette.textSecondary }]}>
              {commandMode ? 'Type to filter commands' : 'Prefix with > to run commands'}
            </Text>
            <Text style={[styles.footerText, { color: palette.textSecondary }]}>
              ↵ selects top · esc closes
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FileRow({
  palette,
  node,
  dirty,
  top,
  onPress,
}: {
  palette: ReturnType<typeof usePalette>;
  node: FileNode;
  dirty: boolean;
  top: boolean;
  onPress: () => void;
}) {
  const dir = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        top && { borderLeftColor: palette.tint },
        pressed && { backgroundColor: palette.surfacePressed },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${node.path}`}
    >
      <Ionicons name="document-text-outline" size={15} color={palette.tint} />
      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          {dirty && <View style={[styles.dirtyDot, { backgroundColor: palette.warning }]} />}
          <Text numberOfLines={1} style={[styles.rowTitle, { color: palette.text }]}>
            {node.name}
          </Text>
        </View>
        {dir ? (
          <Text numberOfLines={1} style={[styles.rowHint, { color: palette.textSecondary }]}>
            {dir}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function CommandRow({
  palette,
  command,
  top,
  onPress,
}: {
  palette: ReturnType<typeof usePalette>;
  command: PaletteCommand;
  top: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        top && { borderLeftColor: palette.tint },
        pressed && { backgroundColor: palette.surfacePressed },
      ]}
      accessibilityRole="button"
      accessibilityLabel={command.title}
    >
      <Ionicons name={command.icon} size={15} color={palette.tint} />
      <View style={styles.rowMain}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: palette.text }]}>
          {command.title}
        </Text>
        {command.hint ? (
          <Text numberOfLines={1} style={[styles.rowHint, { color: palette.textSecondary }]}>
            {command.hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    paddingTop: 72,
    paddingHorizontal: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    maxHeight: '62%',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 6 },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  rowMain: { flex: 1, gap: 1 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  rowHint: { fontSize: 11.5 },
  dirtyDot: { width: 6, height: 6, borderRadius: 3 },
  empty: { padding: 22, alignItems: 'center' },
  emptyText: { fontSize: 13 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: { fontSize: 10.5 },
});
