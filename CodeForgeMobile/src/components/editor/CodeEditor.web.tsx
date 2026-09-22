/**
 * CodeMirror 6 editor — web build.
 * Uses @uiw/react-codemirror directly; language parsers and the vim extension
 * are lazy-loaded so the initial bundle stays light.
 */
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { Prec, EditorState, type Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  EditorView,
  highlightTrailingWhitespace,
  highlightWhitespace,
  keymap,
} from '@codemirror/view';
import { tags as lezerTags } from '@lezer/highlight';
import CodeMirror from '@uiw/react-codemirror';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DEFAULT_EDITOR_OPTIONS, type EditorOptions } from '@/src/lib/editor/editorOptions';
import type { LanguageId } from '@/src/lib/editor/languages';
import { resolveTagExpr } from '@/src/lib/extensions/tagScope';
import type { EditorThemeSpec } from '@/src/lib/extensions/themes';

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
  /** Fired with the current selection text, '' when empty. */
  onSelectionChange?: (text: string) => void;
  /** Fired with the 1-based cursor position for the status bar. */
  onCursorChange?: (line: number, col: number) => void;
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
  options,
  themeSpec = null,
  editable = true,
  onChange,
  onSaveShortcut,
  onSelectionChange,
  onCursorChange,
  revealLine = null,
}: CodeEditorProps) {
  const opts = useMemo<EditorOptions>(
    () => ({ ...DEFAULT_EDITOR_OPTIONS, ...(options ?? {}) }),
    [options],
  );
  const langExt = useLazyExtension(true, () => loadLanguage(language), [language]);
  const vimExt = useLazyExtension(vim, loadVim, []);
  const saveRef = useRef(onSaveShortcut);
  saveRef.current = onSaveShortcut;
  const cursorRef = useRef(onCursorChange);
  cursorRef.current = onCursorChange;
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
    if (opts.wordWrap) list.push(EditorView.lineWrapping);
    if (opts.whitespace) list.push(highlightWhitespace(), highlightTrailingWhitespace());
    // Phase 2: extension theme override (after the base theme so it wins).
    if (themeSpec) {
      const rules: { tag: unknown; color?: string; backgroundColor?: string; fontStyle?: string }[] =
        [];
      for (const rule of themeSpec.syntax) {
        for (const expr of rule.scope) {
          const tag = resolveTagExpr(expr, lezerTags as unknown as Record<string, unknown>);
          if (!tag) continue;
          rules.push({
            tag,
            ...(rule.color ? { color: rule.color } : {}),
            ...(rule.backgroundColor ? { backgroundColor: rule.backgroundColor } : {}),
            ...(rule.fontStyle ? { fontStyle: rule.fontStyle } : {}),
          });
        }
      }
      const c = themeSpec.colors;
      list.push(
        EditorView.theme(
          {
            '&': { backgroundColor: c.background, color: c.foreground },
            '.cm-content': { caretColor: c.cursor },
            '.cm-cursor, .cm-dropCursor': { borderLeftColor: c.cursor },
            '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
              { backgroundColor: c.selection },
            '.cm-gutters': {
              backgroundColor: c.gutterBackground,
              color: c.gutterForeground,
              border: 'none',
            },
            '.cm-activeLine': { backgroundColor: c.activeLine },
            '.cm-activeLineGutter': { backgroundColor: c.activeLine },
          },
          { dark: themeSpec.dark },
        ),
      );
      if (rules.length) {
        list.push(
          syntaxHighlighting(
            HighlightStyle.define(rules as Parameters<typeof HighlightStyle.define>[0]),
            { fallback: false },
          ),
        );
      }
    }
    list.push(
      EditorState.tabSize.of(opts.tabSize),
      indentUnit.of(' '.repeat(opts.tabSize)),
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
  }, [langExt, vimExt, fontSize, opts, themeSpec]);

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
          const lineInfo = viewUpdate.state.doc.lineAt(sel.head);
          cursorRef.current?.(lineInfo.number, sel.head - lineInfo.from + 1);
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
          lineNumbers: opts.lineNumbers,
          highlightActiveLineGutter: opts.lineNumbers,
          foldGutter: true,
          autocompletion: opts.autocomplete,
          highlightActiveLine: opts.activeLine,
          highlightSelectionMatches: opts.activeLine,
          bracketMatching: opts.brackets,
          closeBrackets: opts.brackets,
          indentOnInput: true,
          searchKeymap: true,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, minWidth: 0 },
  codemirror: { height: '100%', flex: 1 },
});
