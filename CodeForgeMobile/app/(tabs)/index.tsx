/**
 * Editor screen — the heart of CodeForge Mobile (Phase 1).
 * File tree + tabs + CodeMirror editor with save / auto-save.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CodeEditor from '@/src/components/editor/CodeEditor';
import { EditorTabs, type EditorTabItem } from '@/src/components/editor/EditorTabs';
import { FileTree } from '@/src/components/editor/FileTree';
import { usePalette } from '@/src/constants/theme';
import { LANGUAGE_LABELS } from '@/src/lib/editor/languages';
import { useAgentStore } from '@/src/store/agentStore';
import { isDirty, useProjectStore } from '@/src/store/projectStore';
import { useSettingsStore } from '@/src/store/settingsStore';

export default function EditorScreen() {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const wide = width >= 768;

  const projectName = useProjectStore((s) => s.projectName);
  const tree = useProjectStore((s) => s.tree);
  const openFiles = useProjectStore((s) => s.openFiles);
  const activeUri = useProjectStore((s) => s.activeUri);
  const isOpeningProject = useProjectStore((s) => s.isOpeningProject);
  const isSaving = useProjectStore((s) => s.isSaving);
  const error = useProjectStore((s) => s.error);
  const openProject = useProjectStore((s) => s.openProject);
  const openDemoProject = useProjectStore((s) => s.openDemoProject);
  const restoreLastProject = useProjectStore((s) => s.restoreLastProject);
  const openFile = useProjectStore((s) => s.openFile);
  const activateFile = useProjectStore((s) => s.activateFile);
  const closeFile = useProjectStore((s) => s.closeFile);
  const updateContent = useProjectStore((s) => s.updateContent);
  const saveFile = useProjectStore((s) => s.saveFile);
  const setSelection = useProjectStore((s) => s.setSelection);
  const selection = useProjectStore((s) => s.selection);
  const clearError = useProjectStore((s) => s.clearError);

  const setDraft = useAgentStore((s) => s.setDraft);
  const lastAppliedEdit = useAgentStore((s) => s.lastAppliedEdit);
  const clearAppliedEdit = useAgentStore((s) => s.clearAppliedEdit);
  const [revealLine, setRevealLine] = useState<number | null>(null);

  const fontSize = useSettingsStore((s) => s.editorFontSize);
  const vimEnabled = useSettingsStore((s) => s.vimEnabled);
  const autoSave = useSettingsStore((s) => s.autoSave);

  const [treeOpen, setTreeOpen] = useState(true);

  useEffect(() => {
    void restoreLastProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Web (and external keyboards): Cmd/Ctrl+S outside the editor surface.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const w = globalThis as {
      addEventListener?: (t: string, cb: (e: unknown) => void) => void;
      removeEventListener?: (t: string, cb: (e: unknown) => void) => void;
    };
    if (!w.addEventListener) return;
    const handler = (e: unknown) => {
      const kev = e as { metaKey?: boolean; ctrlKey?: boolean; key?: string; preventDefault?: () => void };
      if ((kev.metaKey || kev.ctrlKey) && String(kev.key).toLowerCase() === 's') {
        kev.preventDefault?.();
        void saveFile();
      }
    };
    w.addEventListener('keydown', handler);
    return () => w.removeEventListener?.('keydown', handler);
  }, [saveFile]);

  const activeFile = openFiles.find((f) => f.uri === activeUri) ?? null;
  const activeDirty = activeFile ? isDirty(activeFile) : false;
  const tabs: EditorTabItem[] = useMemo(
    () => openFiles.map((f) => ({ uri: f.uri, name: f.name, dirty: isDirty(f) })),
    [openFiles],
  );

  // Phase 5 bridge: when the agent applies an edit to the file we have open,
  // scroll the editor to the first changed line.
  useEffect(() => {
    if (lastAppliedEdit && activeFile && lastAppliedEdit.path === activeFile.path) {
      setRevealLine(lastAppliedEdit.firstNewLine);
      clearAppliedEdit();
      // Reset so a later reveal of the same line still re-fires the prop change.
      const t = setTimeout(() => setRevealLine(null), 800);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [lastAppliedEdit, activeFile, clearAppliedEdit]);

  /** "Send to Agent" — stage a context-aware draft and jump to the chat. */
  const sendToAgent = () => {
    if (activeFile && selection) {
      setDraft(`Look at my selection in ${activeFile.path}: `);
    } else if (activeFile) {
      setDraft(`I need help with ${activeFile.path}: `);
    } else {
      setDraft('');
    }
    router.push('/agent');
  };

  const treePanel = projectName ? (
    <View
      style={[
        styles.treePanel,
        { backgroundColor: palette.bgSecondary, borderColor: palette.border },
        wide ? styles.treePanelSide : styles.treePanelOverlay,
      ]}
    >
      <View style={[styles.treeHeader, { borderColor: palette.border }]}>
        <Ionicons name="folder" size={14} color={palette.tint} />
        <Text numberOfLines={1} style={[styles.treeTitle, { color: palette.text }]}>
          {projectName}
        </Text>
      </View>
      <FileTree
        nodes={tree}
        activeUri={activeUri}
        palette={palette}
        onFilePress={(node) => {
          void openFile(node);
          if (!wide) setTreeOpen(false);
        }}
      />
    </View>
  ) : null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.bgSecondary, borderColor: palette.border }]}>
        <Pressable
          onPress={() => setTreeOpen((o) => !o)}
          style={({ pressed }) => [styles.headerButton, pressed && { backgroundColor: palette.surfacePressed }]}
          accessibilityRole="button"
          accessibilityLabel="Toggle file tree"
          disabled={!projectName}
        >
          <Ionicons
            name="menu"
            size={20}
            color={projectName ? palette.text : palette.textSecondary}
          />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text numberOfLines={1} style={[styles.headerTitle, { color: palette.text }]}>
            {activeFile ? activeFile.path : projectName ?? 'CodeForge Mobile'}
          </Text>
          {activeFile && (
            <Text style={[styles.headerSubtitle, { color: palette.textSecondary }]}>
              {LANGUAGE_LABELS[activeFile.language]}
              {activeDirty ? '  •  unsaved' : ''}
              {autoSave ? '  •  auto-save' : ''}
              {vimEnabled ? '  •  vim' : ''}
            </Text>
          )}
        </View>
        {activeFile && (
          <Pressable
            onPress={sendToAgent}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && { backgroundColor: palette.surfacePressed },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send to agent"
          >
            <Ionicons name="sparkles" size={18} color={palette.tint} />
          </Pressable>
        )}
        {activeFile && (
          <Pressable
            onPress={() => void saveFile()}
            disabled={!activeDirty || isSaving}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && activeDirty && { backgroundColor: palette.surfacePressed },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Save file"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={palette.tint} />
            ) : (
              <Ionicons
                name="save-outline"
                size={19}
                color={activeDirty ? palette.tint : palette.textSecondary}
              />
            )}
          </Pressable>
        )}
      </View>

      {/* Open-file tabs */}
      <EditorTabs
        tabs={tabs}
        activeUri={activeUri}
        palette={palette}
        onSelect={activateFile}
        onClose={(uri) => void closeFile(uri)}
      />

      {/* Body */}
      <View style={styles.body}>
        {wide && treeOpen && treePanel}
        <View style={[styles.editorArea, { backgroundColor: palette.editorBg }]}>
          {!projectName && (
            <EmptyState palette={palette}>
              <Ionicons name="code-slash" size={44} color={palette.tint} />
              <Text style={[styles.emptyTitle, { color: palette.text }]}>CodeForge Mobile</Text>
              <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
                Open a folder from your device to start coding.
                {Platform.OS === 'web'
                  ? ' (Chrome/Edge support real folders; other browsers load the demo.)'
                  : ''}
              </Text>
              <Pressable
                onPress={() => void openProject()}
                disabled={isOpeningProject}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: palette.tint },
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
              >
                {isOpeningProject ? (
                  <ActivityIndicator size="small" color={palette.onTint} />
                ) : (
                  <>
                    <Ionicons name="folder-open-outline" size={18} color={palette.onTint} />
                    <Text style={[styles.primaryButtonText, { color: palette.onTint }]}>
                      Open folder
                    </Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={openDemoProject}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: palette.border },
                  pressed && { backgroundColor: palette.surfacePressed },
                ]}
                accessibilityRole="button"
              >
                <Ionicons name="flask-outline" size={16} color={palette.text} />
                <Text style={[styles.secondaryButtonText, { color: palette.text }]}>
                  Try the demo project
                </Text>
              </Pressable>
            </EmptyState>
          )}

          {projectName && !activeFile && (
            <EmptyState palette={palette}>
              <Ionicons name="document-outline" size={40} color={palette.textSecondary} />
              <Text style={[styles.emptyTitle, { color: palette.text }]}>No file open</Text>
              <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
                Pick a file from the tree to start editing.
              </Text>
              {!wide && !treeOpen && (
                <Pressable
                  onPress={() => setTreeOpen(true)}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    { borderColor: palette.border },
                    pressed && { backgroundColor: palette.surfacePressed },
                  ]}
                  accessibilityRole="button"
                >
                  <Ionicons name="menu" size={16} color={palette.text} />
                  <Text style={[styles.secondaryButtonText, { color: palette.text }]}>
                    Show file tree
                  </Text>
                </Pressable>
              )}
            </EmptyState>
          )}

          {activeFile && (
            <CodeEditor
              key={activeFile.uri}
              value={activeFile.content}
              language={activeFile.language}
              dark={palette.dark}
              fontSize={fontSize}
              vim={vimEnabled}
              revealLine={revealLine}
              onChange={(content) => updateContent(activeFile.uri, content)}
              onSaveShortcut={() => void saveFile()}
              onSelectionChange={(text) => setSelection(text.length > 0 ? text : null)}
            />
          )}
        </View>

        {!wide && treeOpen && projectName && (
          <>
            <Pressable style={styles.backdrop} onPress={() => setTreeOpen(false)} />
            {treePanel}
          </>
        )}
      </View>

      {/* Error toast */}
      {error && (
        <View style={[styles.toast, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
          <Ionicons name="warning-outline" size={16} color={palette.danger} />
          <Text style={[styles.toastText, { color: palette.text }]} numberOfLines={2}>
            {error}
          </Text>
          <Pressable onPress={clearError} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
            <Ionicons name="close" size={16} color={palette.textSecondary} />
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function EmptyState({ children, palette }: { children: React.ReactNode; palette: ReturnType<typeof usePalette> }) {
  return <View style={[styles.empty, { backgroundColor: palette.bg }]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerButton: { padding: 7, borderRadius: 8, minWidth: 34, alignItems: 'center' },
  headerCenter: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 14, fontWeight: '600' },
  headerSubtitle: { fontSize: 11, marginTop: 1 },
  body: { flex: 1, flexDirection: 'row' },
  treePanel: { borderRightWidth: StyleSheet.hairlineWidth },
  treePanelSide: { width: 260 },
  treePanelOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '78%',
    maxWidth: 320,
    zIndex: 20,
    borderRightWidth: 1,
    elevation: 12,
    boxShadow: '4px 0 16px rgba(0,0,0,0.35)',
  },
  treeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  treeTitle: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  editorArea: { flex: 1, minWidth: 0 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 15,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 13.5, textAlign: 'center', lineHeight: 20 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  primaryButtonText: { fontSize: 15, fontWeight: '600' },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: '500' },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    zIndex: 30,
  },
  toastText: { flex: 1, fontSize: 12.5 },
});
