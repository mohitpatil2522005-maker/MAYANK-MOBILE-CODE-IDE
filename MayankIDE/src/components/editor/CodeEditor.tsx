/**
 * CodeMirror 6 editor — native (iOS/Android) build.
 * CodeMirror runs inside a WebView; this component bridges props ↔ messages.
 * See codemirrorHtml.ts for the in-page bundle and the message protocol.
 */
import React, { useEffect, useMemo, useRef, type ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import WebViewBase, {
  type WebViewMessageEvent,
  type WebViewProps,
} from 'react-native-webview';

import type { LanguageId } from '@/src/lib/editor/languages';
import { DEFAULT_EDITOR_OPTIONS, type EditorOptions } from '@/src/lib/editor/editorOptions';
import type { FindOptions } from '@/src/lib/editor/find';
import type { EditorThemeSpec } from '@/src/lib/extensions/themes';
import { buildEditorHtml } from './codemirrorHtml';

/** Imperative handle exposed via ref — lets the host push messages (e.g. openFind). */
export interface CodeEditorHandle {
  /** Push a raw message string to the editor. Used by the Find/Replace bar. */
  postMessage: (data: string) => void;
  /** Force the editor to focus. */
  focus: () => void;
}

/** Instance methods used from the WebView ref (typed loosely in the lib). */
interface WebViewHandle {
  postMessage: (data: string) => void;
  injectJavaScript: (script: string) => void;
}

// react-native-webview's class generic defaults produce `never` props with
// some RN type versions; re-cast to a plain typed component.
const WebView = WebViewBase as unknown as ComponentType<
  WebViewProps & { ref?: React.Ref<WebViewHandle> }
>;

export interface CodeEditorProps {
  value: string;
  language: LanguageId;
  dark: boolean;
  fontSize: number;
  vim: boolean;
  /** Feature switches from the settings schema (tab size, wrap, gutters…). */
  options?: EditorOptions;
  /** Extension theme override (Phase 2); null/undefined → built-in theme. */
  themeSpec?: EditorThemeSpec | null;
  editable?: boolean;
  onChange: (value: string) => void;
  onSaveShortcut?: () => void;
  /** Fired (debounced) with the current selection text, '' when empty. */
  onSelectionChange?: (text: string) => void;
  /** Fired with the 1-based cursor position for the status bar. */
  onCursorChange?: (line: number, col: number) => void;
  /** 1-based line to scroll to + select (e.g. after an agent edit applies). */
  revealLine?: number | null;
  /** Open the in-editor find panel and seed its query. */
  onFindRequest?: (initial?: string) => void;
}

type OutboundMessage =
  | { type: 'setValue'; value: string }
  | { type: 'setLanguage'; lang: LanguageId }
  | { type: 'setTheme'; dark: boolean }
  | { type: 'setThemeSpec'; spec: EditorThemeSpec | null }
  | { type: 'setFontSize'; px: number }
  | { type: 'setVim'; enabled: boolean }
  | { type: 'setOptions'; options: EditorOptions }
  | { type: 'revealLine'; line: number }
  | { type: 'focus' }
  | { type: 'find'; query: string; options: FindOptions }
  | { type: 'findNext' }
  | { type: 'findPrev' }
  | { type: 'replaceOne'; replacement: string }
  | { type: 'replaceAll'; replacement: string }
  | { type: 'openFind'; initial?: string };

interface InboundMessage {
  type: 'ready' | 'change' | 'save' | 'error' | 'selection' | 'openFind';
  value?: string;
  text?: string;
  line?: number;
  col?: number;
  message?: string;
  initial?: string;
}

function CodeEditorInner({
  value,
  language,
  dark,
  fontSize,
  vim,
  options,
  themeSpec = null,
  onChange,
  onSaveShortcut,
  onSelectionChange,
  onCursorChange,
  revealLine = null,
  onFindRequest,
}: CodeEditorProps, ref: React.Ref<CodeEditorHandle>) {
  const webRef = useRef<WebViewHandle>(null);
  const ready = useRef(false);
  const queue = useRef<string[]>([]);
  /** Last content that came from the user typing inside the WebView. */
  const lastKeystrokeValue = useRef(value);
  const editorOptions = useMemo<EditorOptions>(
    () => ({ ...DEFAULT_EDITOR_OPTIONS, ...(options ?? {}) }),
    [options],
  );
  const latest = useRef({ language, dark, fontSize, vim, options: editorOptions, themeSpec });
  latest.current = { language, dark, fontSize, vim, options: editorOptions, themeSpec };
  const callbacks = useRef({ onChange, onSaveShortcut, onSelectionChange, onCursorChange, onFindRequest });
  callbacks.current = { onChange, onSaveShortcut, onSelectionChange, onCursorChange, onFindRequest };

  // HTML depends only on initial appearance; updates go through messages.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildEditorHtml({ dark, fontSize, options: editorOptions }), []);

  const post = (msg: OutboundMessage) => {
    const serialized = JSON.stringify(msg);
    if (ready.current) webRef.current?.postMessage(serialized);
    else queue.current.push(serialized);
  };

  React.useImperativeHandle(
    ref,
    () => ({
      postMessage: (data: string) => {
        try {
          const msg = JSON.parse(data) as OutboundMessage;
          post(msg);
        } catch {
          // ignore malformed
        }
      },
      focus: () => post({ type: 'focus' }),
    }),
    [],
  );

  // Prop → WebView sync (echo-safe for setValue: only push external changes).
  useEffect(() => {
    if (value !== lastKeystrokeValue.current) {
      lastKeystrokeValue.current = value;
      post({ type: 'setValue', value });
    }
  }, [value]);
  useEffect(() => post({ type: 'setLanguage', lang: language }), [language]);
  useEffect(() => post({ type: 'setTheme', dark }), [dark]);
  useEffect(() => post({ type: 'setFontSize', px: fontSize }), [fontSize]);
  useEffect(() => post({ type: 'setVim', enabled: vim }), [vim]);
  useEffect(() => post({ type: 'setOptions', options: editorOptions }), [editorOptions]);
  useEffect(() => post({ type: 'setThemeSpec', spec: themeSpec }), [themeSpec]);
  useEffect(() => {
    if (revealLine) post({ type: 'revealLine', line: revealLine });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealLine]);

  const handleMessage = (event: WebViewMessageEvent) => {
    let msg: InboundMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data) as InboundMessage;
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      ready.current = true;
      const { language: l, dark: d, fontSize: fs, vim: v, options: o, themeSpec: ts } =
        latest.current;
      post({ type: 'setTheme', dark: d });
      post({ type: 'setFontSize', px: fs });
      post({ type: 'setLanguage', lang: l });
      post({ type: 'setVim', enabled: v });
      post({ type: 'setOptions', options: o });
      post({ type: 'setThemeSpec', spec: ts });
      post({ type: 'setValue', value: lastKeystrokeValue.current });
      queue.current.forEach((raw) => webRef.current?.postMessage(raw));
      queue.current = [];
    } else if (msg.type === 'change' && typeof msg.value === 'string') {
      lastKeystrokeValue.current = msg.value;
      callbacks.current.onChange(msg.value);
    } else if (msg.type === 'save') {
      callbacks.current.onSaveShortcut?.();
    } else if (msg.type === 'selection') {
      callbacks.current.onSelectionChange?.(msg.text ?? '');
      if (typeof msg.line === 'number' && typeof msg.col === 'number') {
        callbacks.current.onCursorChange?.(msg.line, msg.col);
      }
    } else if (msg.type === 'error') {
      // Editor-page errors surface in dev mode only; never crash the app.
      if (__DEV__) console.warn('[CodeEditor WebView]', msg.message);
    } else if (msg.type === 'openFind') {
      callbacks.current.onFindRequest?.(msg.initial);
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        source={{ html }}
        onMessage={handleMessage}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView
        automaticallyAdjustContentInsets={false}
        style={[styles.webview, { backgroundColor: dark ? '#282c34' : '#ffffff' }]}
      />
    </View>
  );
};

const CodeEditor = React.forwardRef<CodeEditorHandle, CodeEditorProps>(CodeEditorInner);

export default CodeEditor;

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, minWidth: 0 },
  webview: { flex: 1 },
});
