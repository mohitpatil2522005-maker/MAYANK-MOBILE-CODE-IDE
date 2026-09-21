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
import { buildEditorHtml } from './codemirrorHtml';

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
  editable?: boolean;
  onChange: (value: string) => void;
  onSaveShortcut?: () => void;
  /** Fired (debounced) with the current selection text, '' when empty. */
  onSelectionChange?: (text: string) => void;
  /** 1-based line to scroll to + select (e.g. after an agent edit applies). */
  revealLine?: number | null;
}

type OutboundMessage =
  | { type: 'setValue'; value: string }
  | { type: 'setLanguage'; lang: LanguageId }
  | { type: 'setTheme'; dark: boolean }
  | { type: 'setFontSize'; px: number }
  | { type: 'setVim'; enabled: boolean }
  | { type: 'revealLine'; line: number }
  | { type: 'focus' };

interface InboundMessage {
  type: 'ready' | 'change' | 'save' | 'error' | 'selection';
  value?: string;
  text?: string;
  message?: string;
}

export default function CodeEditor({
  value,
  language,
  dark,
  fontSize,
  vim,
  onChange,
  onSaveShortcut,
  onSelectionChange,
  revealLine = null,
}: CodeEditorProps) {
  const webRef = useRef<WebViewHandle>(null);
  const ready = useRef(false);
  const queue = useRef<string[]>([]);
  /** Last content that came from the user typing inside the WebView. */
  const lastKeystrokeValue = useRef(value);
  const latest = useRef({ language, dark, fontSize, vim });
  latest.current = { language, dark, fontSize, vim };
  const callbacks = useRef({ onChange, onSaveShortcut, onSelectionChange });
  callbacks.current = { onChange, onSaveShortcut, onSelectionChange };

  // HTML depends only on initial appearance; updates go through messages.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildEditorHtml({ dark, fontSize }), []);

  const post = (msg: OutboundMessage) => {
    const serialized = JSON.stringify(msg);
    if (ready.current) webRef.current?.postMessage(serialized);
    else queue.current.push(serialized);
  };

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
      const { language: l, dark: d, fontSize: fs, vim: v } = latest.current;
      post({ type: 'setTheme', dark: d });
      post({ type: 'setFontSize', px: fs });
      post({ type: 'setLanguage', lang: l });
      post({ type: 'setVim', enabled: v });
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
    } else if (msg.type === 'error') {
      // Editor-page errors surface in dev mode only; never crash the app.
      if (__DEV__) console.warn('[CodeEditor WebView]', msg.message);
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
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, minWidth: 0 },
  webview: { flex: 1 },
});
