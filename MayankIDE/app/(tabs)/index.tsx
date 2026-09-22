/**
 * Editor screen — the heart of Mayank IDE (Phase 1).
 * File tree + tabs + CodeMirror editor with save / auto-save.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView } from 'react-native-safe-area-context';

import CodeEditor from '@/src/components/editor/CodeEditor';
import { CommandPalette, type PaletteCommand } from '@/src/components/editor/CommandPalette';
import { EditorTabs, type EditorTabItem } from '@/src/components/editor/EditorTabs';
import { FileTree } from '@/src/components/editor/FileTree';
import { usePalette, type Palette } from '@/src/constants/theme';
import { DEFAULT_EDITOR_OPTIONS } from '@/src/lib/editor/editorOptions';
import { LANGUAGE_LABELS } from '@/src/lib/editor/languages';
import { getThemeSpec } from '@/src/lib/extensions/themes';
import { notifySuccess, tapLight, tapMedium } from '@/src/lib/haptics';
import { agentTargetLabel, useAgentStore } from '@/src/store/agentStore';
import { useExtensionStore } from '@/src/store/extensionStore';
import { allProjectFiles, isDirty, useProjectStore } from '@/src/store/projectStore';
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
  const moveTab = useProjectStore((s) => s.moveTab);
  const updateContent = useProjectStore((s) => s.updateContent);
  const saveFile = useProjectStore((s) => s.saveFile);
  const setSelection = useProjectStore((s) => s.setSelection);
  const selection = useProjectStore((s) => s.selection);
  const clearError = useProjectStore((s) => s.clearError);

  const setDraft = useAgentStore((s) => s.setDraft);
  const newChat = useAgentStore((s) => s.newChat);
  const lastAppliedEdit = useAgentStore((s) => s.lastAppliedEdit);
  const clearAppliedEdit = useAgentStore((s) => s.clearAppliedEdit);
  // Provider subscriptions keep the status-bar model pill reactive.
  useAgentStore((s) => s.activeProviderId);
  useAgentStore((s) => s.activeModel);
  const [revealLine, setRevealLine] = useState<number | null>(null);

  const fontSize = useSettingsStore((s) => s.editorFontSize);
  const vimEnabled = useSettingsStore((s) => s.vimEnabled);
  const autoSave = useSettingsStore((s) => s.autoSave);
  const tabSize = useSettingsStore((s) => s.tabSize);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const lineNumbers = useSettingsStore((s) => s.lineNumbersEnabled);
  const autocomplete = useSettingsStore((s) => s.autocompleteEnabled);
  const activeLine = useSettingsStore((s) => s.activeLineEnabled);
  const brackets = useSettingsStore((s) => s.bracketsEnabled);
  const whitespace = useSettingsStore((s) => s.whitespaceVisible);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setOption = useSettingsStore((s) => s.setOption);

  const editorOptions = useMemo(
    () => ({
      ...DEFAULT_EDITOR_OPTIONS,
      tabSize,
      wordWrap,
      lineNumbers,
      autocomplete,
      activeLine,
      brackets,
      whitespace,
    }),
    [tabSize, wordWrap, lineNumbers, autocomplete, activeLine, brackets, whitespace],
  );

  const activeThemeId = useExtensionStore((s) => s.activeThemeId);
  const themeSpec = useMemo(() => getThemeSpec(activeThemeId), [activeThemeId]);

  const [treeOpen, setTreeOpen] = useState(true);
  const [cursor, setCursor] = useState<{ line: number; col: number }>({ line: 1, col: 1 });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteInitial, setPaletteInitial] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  const openPalette = (initial = '') => {
    setPaletteInitial(initial);
    setPaletteOpen(true);
  };

  useEffect(() => {
    void restoreLastProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Web (and external keyboards): Cmd/Ctrl+S save, Cmd/Ctrl+P quick-open,
  // Cmd/Ctrl+Shift+P command mode — outside the editor surface.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const w = globalThis as {
      addEventListener?: (t: string, cb: (e: unknown) => void) => void;
      removeEventListener?: (t: string, cb: (e: unknown) => void) => void;
    };
    if (!w.addEventListener) return;
    const handler = (e: unknown) => {
      const kev = e as {
        metaKey?: boolean;
        ctrlKey?: boolean;
        shiftKey?: boolean;
        key?: string;
        preventDefault?: () => void;
      };
      const mod = kev.metaKey || kev.ctrlKey;
      if (!mod) return;
      const key = String(kev.key).toLowerCase();
      if (key === 's') {
        kev.preventDefault?.();
        void saveFile();
      } else if (key === 'p') {
        kev.preventDefault?.();
        openPalette(kev.shiftKey ? '>' : '');
      }
    };
    w.addEventListener('keydown', handler);
    return () => w.removeEventListener?.('keydown', handler);
  }, [saveFile]);

  const activeFile = openFiles.find((f) => f.uri === activeUri) ?? null;
  const activeDirty = activeFile ? isDirty(activeFile) : false;

  // Close the preview when opening a different file or a non-Markdown one.
  useEffect(() => {
    setPreviewOpen(false);
  }, [activeUri]);

  /** Long-press a tab → VS-Code-like tab actions (Phase 1.1 reorder). */
  const onTabLongPress = (uri: string) => {
    const index = openFiles.findIndex((f) => f.uri === uri);
    if (index === -1) return;
    tapLight();
    const name = openFiles[index].name;
    const buttons = [
      ...(index > 0
        ? [{ text: 'Move Left', onPress: () => moveTab(uri, -1 as const) }]
        : []),
      ...(index < openFiles.length - 1
        ? [{ text: 'Move Right', onPress: () => moveTab(uri, 1 as const) }]
        : []),
      { text: 'Close Tab', style: 'destructive' as const, onPress: () => void closeFile(uri) },
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert(name, 'Tab actions', buttons);
  };
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
    tapMedium();
    if (activeFile && selection) {
      setDraft(`Look at my selection in ${activeFile.path}: `);
    } else if (activeFile) {
      setDraft(`I need help with ${activeFile.path}: `);
    } else {
      setDraft('');
    }
    router.push('/agent');
  };

  // ─── Command palette (Phase 1.2) ──────────────────────────────
  const paletteFiles = useMemo(() => allProjectFiles(tree), [tree]);
  const dirtyUris = useMemo(
    () => new Set(openFiles.filter((f) => isDirty(f)).map((f) => f.uri)),
    [openFiles],
  );

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const list: PaletteCommand[] = [];
    if (activeFile) {
      list.push(
        {
          id: 'file.save',
          title: `Save ${activeFile.name}`,
          hint: 'Ctrl/Cmd+S',
          icon: 'save-outline',
          run: () => void saveFile().then(() => notifySuccess()),
        },
        {
          id: 'file.close',
          title: `Close ${activeFile.name}`,
          icon: 'close-circle-outline',
          run: () => void closeFile(activeFile.uri),
        },
        {
          id: 'agent.send',
          title: 'Send File to Agent',
          hint: selection ? 'Includes current selection' : 'Whole file context',
          icon: 'sparkles-outline',
          run: sendToAgent,
        },
      );
    }
    list.push({
      id: 'workbench.toggleTree',
      title: 'Toggle File Tree',
      icon: 'menu-outline',
      run: () => setTreeOpen((o) => !o),
    });
    list.push({
      id: 'workbench.toggleTheme',
      title: `Switch to ${themeMode === 'dark' ? 'Light' : 'Dark'} Theme`,
      icon: 'contrast-outline',
      run: () => setOption('themeMode', themeMode === 'dark' ? 'light' : 'dark'),
    });
    list.push({
      id: 'editor.toggleWrap',
      title: `${wordWrap ? 'Disable' : 'Enable'} Word Wrap`,
      icon: 'resize-outline',
      run: () => setOption('wordWrap', !wordWrap),
    });
    list.push({
      id: 'agent.newChat',
      title: 'New Agent Chat',
      icon: 'chatbubbles-outline',
      run: () => {
        newChat();
        router.push('/agent');
      },
    });
    list.push({
      id: 'workbench.settings',
      title: 'Open Settings',
      icon: 'settings-outline',
      run: () => router.push('/settings'),
    });
    if (activeFile) {
      list.push({
        id: 'editor.toggleTreeHide',
        title: 'Focus Editor (hide tree)',
        icon: 'eye-off-outline',
        run: () => setTreeOpen(false),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeFile,
    selection,
    saveFile,
    closeFile,
    themeMode,
    wordWrap,
    setOption,
    newChat,
  ]);

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
          tapLight();
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
            {activeFile ? activeFile.path : projectName ?? 'Mayank IDE'}
          </Text>
          {activeFile && (
            <Text style={[styles.headerSubtitle, { color: palette.textSecondary }]}>
              {activeDirty ? 'unsaved changes' : 'saved'}
              {autoSave ? '  •  auto-save on' : ''}
            </Text>
          )}
        </View>
        {activeFile?.language === 'markdown' && (
          <Pressable
            onPress={() => {
              tapLight();
              setPreviewOpen((o) => !o);
            }}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && { backgroundColor: palette.surfacePressed },
              previewOpen && { backgroundColor: palette.tint + '2a' },
            ]}
            accessibilityRole="button"
            accessibilityLabel={previewOpen ? 'Close preview' : 'Open markdown preview'}
          >
            <Ionicons
              name={previewOpen ? 'eye' : 'eye-outline'}
              size={18}
              color={previewOpen ? palette.tint : palette.text}
            />
          </Pressable>
        )}
        {projectName && (
          <Pressable
            onPress={() => openPalette('')}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && { backgroundColor: palette.surfacePressed },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Quick open (Ctrl/Cmd+P)"
          >
            <Ionicons name="search" size={17} color={palette.text} />
          </Pressable>
        )}
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
            onPress={() => void saveFile().then(() => notifySuccess())}
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
        onSelect={(uri) => {
          tapLight();
          activateFile(uri);
        }}
        onLongPress={onTabLongPress}
        onClose={(uri) => void closeFile(uri)}
      />

      {/* Breadcrumbs (Phase 1.1) */}
      {activeFile && (
        <View
          style={[
            styles.breadcrumbs,
            { backgroundColor: palette.bgSecondary, borderBottomColor: palette.border },
          ]}
        >
          {activeFile.path.split('/').map((segment, i, all) => (
            <View key={i} style={styles.crumbItem}>
              {i > 0 && (
                <Text style={[styles.crumbSep, { color: palette.textSecondary }]}>›</Text>
              )}
              <Text
                numberOfLines={1}
                style={[
                  styles.crumbText,
                  {
                    color: i === all.length - 1 ? palette.text : palette.textSecondary,
                    fontWeight: i === all.length - 1 ? '600' : '400',
                  },
                ]}
              >
                {segment}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Body */}
      <View style={styles.body}>
        {wide && treeOpen && treePanel}
        <View style={[styles.editorArea, { backgroundColor: palette.editorBg }]}>
          {!projectName && (
            <EmptyState palette={palette}>
              <Ionicons name="code-slash" size={44} color={palette.tint} />
              <Text style={[styles.emptyTitle, { color: palette.text }]}>Mayank IDE</Text>
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
            <View style={styles.editorSplit}>
              <View
                style={[
                  styles.editorPane,
                  // Split preview: side-by-side on wide screens, preview
                  // replaces the editor surface on narrow ones.
                  previewOpen && (wide ? styles.editorPaneHalf : styles.editorPaneHidden),
                ]}
              >
                <CodeEditor
                  key={activeFile.uri}
                  value={activeFile.content}
                  language={activeFile.language}
                  dark={themeSpec ? themeSpec.dark : palette.dark}
                  fontSize={fontSize}
                  vim={vimEnabled}
                  options={editorOptions}
                  themeSpec={themeSpec}
                  revealLine={revealLine}
                  onChange={(content) => updateContent(activeFile.uri, content)}
                  onSaveShortcut={() => void saveFile()}
                  onSelectionChange={(text) => setSelection(text.length > 0 ? text : null)}
                  onCursorChange={(line, col) => setCursor({ line, col })}
                />
              </View>
              {previewOpen && activeFile.language === 'markdown' && (
                <MarkdownPreview
                  palette={palette}
                  content={activeFile.content}
                  bordered={wide}
                />
              )}
            </View>
          )}

          {/* VS Code-style status bar */}
          {activeFile && (
            <EditorStatusBar
              palette={palette}
              cursor={cursor}
              languageLabel={LANGUAGE_LABELS[activeFile.language]}
              providerLabel={agentTargetLabel()}
              tabSize={tabSize}
              wordWrap={wordWrap}
              vimEnabled={vimEnabled}
              autoSave={autoSave}
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

      {/* Command palette / quick open (Phase 1.2) */}
      <CommandPalette
        visible={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        files={paletteFiles}
        dirtyUris={dirtyUris}
        onOpenFile={(node) => {
          void openFile(node);
          if (!wide) setTreeOpen(false);
        }}
        commands={paletteCommands}
        initialQuery={paletteInitial}
      />

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

/** Split Markdown preview (Phase 1.1) — live-renders the buffer. */
function MarkdownPreview({
  palette,
  content,
  bordered,
}: {
  palette: Palette;
  content: string;
  bordered: boolean;
}) {
  const mdStyle = useMemo(
    () => ({
      body: {
        color: palette.text,
        fontSize: 14,
        lineHeight: 21,
      } as object,
      heading1: { color: palette.text, fontSize: 24, marginVertical: 8 } as object,
      heading2: { color: palette.text, fontSize: 20, marginVertical: 6 } as object,
      heading3: { color: palette.text, fontSize: 17, marginVertical: 6 } as object,
      code_inline: {
        backgroundColor: palette.bgSecondary,
        color: palette.tint,
        borderRadius: 4,
        paddingHorizontal: 4,
      } as object,
      fence: {
        backgroundColor: palette.bgSecondary,
        borderColor: palette.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 8,
        padding: 10,
        color: palette.text,
      } as object,
      blockquote: {
        backgroundColor: palette.bgSecondary,
        borderLeftColor: palette.tint,
        borderLeftWidth: 3,
        paddingHorizontal: 10,
        borderRadius: 0,
      } as object,
      link: { color: palette.tint } as object,
      hr: { backgroundColor: palette.border } as object,
      table: { borderColor: palette.border } as object,
      tr: { borderColor: palette.border } as object,
    }),
    [palette],
  );
  return (
    <View
      style={[
        styles.previewPane,
        bordered && styles.previewPaneBordered,
        { borderLeftColor: palette.border, backgroundColor: palette.editorBg },
      ]}
      accessibilityLabel="Markdown preview"
    >
      <ScrollView contentContainerStyle={styles.previewScroll} keyboardShouldPersistTaps="handled">
        <Markdown style={mdStyle}>{content}</Markdown>
      </ScrollView>
    </View>
  );
}

/** Bottom strip à la VS Code: cursor position, indent, model pill, language. */
function EditorStatusBar({
  palette,
  cursor,
  languageLabel,
  providerLabel,
  tabSize,
  wordWrap,
  vimEnabled,
  autoSave,
}: {
  palette: Palette;
  cursor: { line: number; col: number };
  languageLabel: string;
  providerLabel: string;
  tabSize: number;
  wordWrap: boolean;
  vimEnabled: boolean;
  autoSave: boolean;
}) {
  const hasProvider = providerLabel !== 'No provider';
  return (
    <View
      style={[
        styles.statusBar,
        { backgroundColor: palette.bgSecondary, borderTopColor: palette.border },
      ]}
      accessibilityLabel="Editor status bar"
    >
      <Text style={[styles.statusItem, { color: palette.textSecondary }]}>
        Ln {cursor.line}, Col {cursor.col}
      </Text>
      <Text style={[styles.statusItem, { color: palette.textSecondary }]}>Spaces: {tabSize}</Text>
      {wordWrap ? (
        <Text style={[styles.statusItem, { color: palette.textSecondary }]}>Wrap</Text>
      ) : null}
      {vimEnabled ? (
        <Text style={[styles.statusItem, { color: palette.tint }]}>VIM</Text>
      ) : null}
      <View style={styles.statusSpacer} />
      {/* Active AI provider/model pill (Phase 1.1) */}
      <Pressable
        onPress={() => router.push('/agent')}
        hitSlop={6}
        style={[styles.providerPill, { backgroundColor: hasProvider ? palette.tint + '22' : 'transparent' }]}
        accessibilityRole="button"
        accessibilityLabel={`Agent model: ${providerLabel}`}
      >
        <Ionicons
          name="sparkles"
          size={10}
          color={hasProvider ? palette.tint : palette.textSecondary}
        />
        <Text
          numberOfLines={1}
          style={[styles.providerPillText, { color: hasProvider ? palette.tint : palette.textSecondary }]}
        >
          {hasProvider ? providerLabel : 'Set up AI'}
        </Text>
      </Pressable>
      {autoSave ? <Ionicons name="cloud-done-outline" size={12} color={palette.success} /> : null}
      <Text style={[styles.statusItem, { color: palette.textSecondary }]}>{languageLabel}</Text>
    </View>
  );
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
  editorSplit: { flex: 1, flexDirection: 'row', minWidth: 0 },
  editorPane: { flex: 1, minWidth: 0 },
  editorPaneHalf: { flex: 0.55 },
  editorPaneHidden: { display: 'none' },
  previewPane: { flex: 1, minWidth: 0 },
  previewPaneBordered: { flex: 0.45, borderLeftWidth: StyleSheet.hairlineWidth },
  previewScroll: { padding: 16, paddingBottom: 40 },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statusItem: { fontSize: 11, fontWeight: '500' },
  statusSpacer: { flex: 1 },
  providerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 180,
  },
  providerPillText: { fontSize: 10.5, fontWeight: '600', flexShrink: 1 },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  crumbItem: { flexDirection: 'row', alignItems: 'center' },
  crumbSep: { fontSize: 12, marginHorizontal: 5 },
  crumbText: { fontSize: 12, flexShrink: 1 },
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
