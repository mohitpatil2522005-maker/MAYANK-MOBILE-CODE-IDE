/**
 * CodeMirror 6 editor — web build.
 * Uses @uiw/react-codemirror directly; language parsers and the vim extension
 * are lazy-loaded so the initial bundle stays light.
 */
import { Prec, type Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { LanguageId } from '@/src/lib/editor/languages';

export interface CodeEditorProps {
  value: string;
  language: LanguageId;
  dark: boolean;
  fontSize: number;
  vim: boolean;
  editable?: boolean;
  onChange: (value: string) => void;
  onSaveShortcut?: () => void;
  /** Fired with the current selection text, '' when empty. */
  onSelectionChange?: (text: string) => void;
  /** 1-based line to scroll to + select (e.g. after an agent edit applies). */
  revealLine?: number | null;
}

const langCache = new Map<LanguageId, Promise<Extension>>();

function loadLanguage(lang: LanguageId): Promise<Extension> {
  let cached = langCache.get(lang);
  if (!cached) {
    switch (lang) {
      case 'javascript':
        cached = import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true }));
        break;
      case 'typescript':
        cached = import('@codemirror/lang-javascript').then((m) =>
          m.javascript({ jsx: true, typescript: true }),
        );
        break;
      case 'python':
        cached = import('@codemirror/lang-python').then((m) => m.python());
        break;
      case 'json':
        cached = import('@codemirror/lang-json').then((m) => m.json());
        break;
      case 'rust':
        cached = import('@codemirror/lang-rust').then((m) => m.rust());
        break;
      case 'go':
        cached = import('@codemirror/lang-go').then((m) => m.go());
        break;
      case 'html':
        cached = import('@codemirror/lang-html').then((m) => m.html());
        break;
      case 'css':
        cached = import('@codemirror/lang-css').then((m) => m.css());
        break;
      case 'markdown':
        cached = import('@codemirror/lang-markdown').then((m) => m.markdown());
        break;
      default:
        cached = Promise.resolve([]);
    }
    langCache.set(lang, cached);
  }
  return cached;
}

let vimCache: Promise<Extension> | null = null;
function loadVim(): Promise<Extension> {
  vimCache ??= import('@replit/codemirror-vim').then((m) => m.vim());
  return vimCache;
}

/** Async extension loader hook. */
function useLazyExtension(enabled: boolean, loader: () => Promise<Extension>, deps: unknown[]): Extension | null {
  const [ext, setExt] = useState<Extension | null>(null);
  useEffect(() => {
    if (!enabled) {
      setExt(null);
      return;
    }
    let alive = true;
    setExt(null);
    void loader().then((loaded) => {
      if (alive) setExt(() => loaded);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
  return ext;
}

export default function CodeEditor({
  value,
  language,
  dark,
  fontSize,
  vim,
  editable = true,
  onChange,
  onSaveShortcut,
  onSelectionChange,
  revealLine = null,
}: CodeEditorProps) {
  const langExt = useLazyExtension(true, () => loadLanguage(language), [language]);
  const vimExt = useLazyExtension(vim, loadVim, []);
  const saveRef = useRef(onSaveShortcut);
  saveRef.current = onSaveShortcut;
  const selectionRef = useRef(onSelectionChange);
  selectionRef.current = onSelectionChange;
  const lastSelection = useRef('');
  const viewRef = useRef<EditorView | null>(null);

  // Scroll/select a line (agent edit applied, file link, …).
  useEffect(() => {
    const view = viewRef.current;
    if (!revealLine || !view) return;
    const doc = view.state.doc;
    const line = doc.line(Math.max(1, Math.min(revealLine, doc.lines)));
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
      userEvent: 'select',
    });
    view.focus();
  }, [revealLine]);

  const extensions = useMemo<Extension[]>(() => {
    const list: Extension[] = [];
    // vim must stay ahead of other keymaps to win key events.
    if (vimExt) list.push(Prec.highest(vimExt));
    if (langExt) list.push(langExt);
    list.push(
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              saveRef.current?.();
              return true;
            },
          },
        ]),
      ),
      EditorView.theme({
        '&': { fontSize: `${fontSize}px`, height: '100%' },
        '.cm-scroller': { fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace' },
      }),
    );
    return list;
  }, [langExt, vimExt, fontSize]);

  return (
    <View style={styles.container}>
      <CodeMirror
        value={value}
        onChange={onChange}
        onUpdate={(viewUpdate) => {
          if (!(viewUpdate.selectionSet || viewUpdate.docChanged)) return;
          const sel = viewUpdate.state.selection.main;
          const text = sel.empty ? '' : viewUpdate.state.sliceDoc(sel.from, sel.to).slice(0, 4000);
          if (text !== lastSelection.current) {
            lastSelection.current = text;
            selectionRef.current?.(text);
          }
        }}
        theme={dark ? oneDark : 'light'}
        extensions={extensions}
        editable={editable}
        onCreateEditor={(view) => {
          viewRef.current = view;
        }}
        height="100%"
        style={styles.codemirror}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          autocompletion: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          indentOnInput: true,
          searchKeymap: true,
          tabSize: 2,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, minWidth: 0 },
  codemirror: { height: '100%', flex: 1 },
});
