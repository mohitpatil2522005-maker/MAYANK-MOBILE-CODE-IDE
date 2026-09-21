/**
 * HTML/JS bundle served inside the native WebView editor (CodeMirror 6).
 *
 * Modules are loaded from esm.sh at runtime — the device therefore needs
 * network on first load (the page caches afterwards). Cross-package
 * deduplication of @codemirror/* relies on esm.sh resolving peer ranges to
 * identical URLs; versions are pinned to a contemporaneous set to keep that
 * true. Post-MVP: vendor a pre-bundled editor asset for full offline use.
 *
 * Bridge protocol (JSON strings):
 *   page → RN:  {type:'ready'} | {type:'change', value} | {type:'save'} | {type:'error', message}
 *               | {type:'selection', text, line, col}
 *   RN → page:  {type:'setValue'|'setLanguage'|'setTheme'|'setFontSize'|'setVim'|'focus', ...}
 *               | {type:'setOptions', options: EditorOptions}  (feature switches)
 */

import { DEFAULT_EDITOR_OPTIONS, type EditorOptions } from '@/src/lib/editor/editorOptions';

export interface EditorHtmlOptions {
  dark: boolean;
  fontSize: number;
  options?: EditorOptions;
}

const ESM = 'https://esm.sh';

export function buildEditorHtml({ dark, fontSize, options }: EditorHtmlOptions): string {
  const initial = { ...DEFAULT_EDITOR_OPTIONS, ...(options ?? {}) };
  const initialJson = JSON.stringify(initial);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: ${dark ? '#282c34' : '#ffffff'}; }
  #editor { height: 100vh; }
  .cm-editor { height: 100%; }
  .cm-editor.cm-focused { outline: none; }
</style>
</head>
<body>
<div id="editor"></div>
<script type="module">
const post = (msg) => {
  try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {}
};
window.addEventListener('error', (e) => post({ type: 'error', message: String(e.message || e) }));

let view = null;
let suppressChange = false;
let currentLang = 'text';
let currentTheme = ${dark ? 'true' : 'false'};
let currentFontSize = ${fontSize};
let vimEnabled = false;
let opts = ${initialJson};

async function main() {
  const { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, highlightWhitespace, highlightTrailingWhitespace } =
    await import('${ESM}/@codemirror/view@6.36.2');
  const { EditorState, Compartment, Prec } = await import('${ESM}/@codemirror/state@6.5.2');
  const { defaultKeymap, history, historyKeymap, indentWithTab } = await import('${ESM}/@codemirror/commands@6.8.0');
  const { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput, indentUnit } =
    await import('${ESM}/@codemirror/language@6.11.0');
  const { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } =
    await import('${ESM}/@codemirror/autocomplete@6.18.4');
  const { search, searchKeymap, highlightSelectionMatches } = await import('${ESM}/@codemirror/search@6.5.8');
  const { oneDark } = await import('${ESM}/@codemirror/theme-one-dark@6.1.3');

  const langCompartment = new Compartment();
  const themeCompartment = new Compartment();
  const vimCompartment = new Compartment();
  const gutterCompartment = new Compartment();   // line numbers + active-line gutter
  const wrapCompartment = new Compartment();     // word wrap
  const tabCompartment = new Compartment();      // tab size + indent unit
  const activeCompartment = new Compartment();   // active line + selection matches
  const bracketCompartment = new Compartment();  // bracket matching + auto-close
  const completionCompartment = new Compartment(); // autocomplete
  const whitespaceCompartment = new Compartment(); // visible whitespace

  const langLoaders = {
    javascript: () => import('${ESM}/@codemirror/lang-javascript@6.2.3').then((m) => m.javascript({ jsx: true })),
    typescript: () => import('${ESM}/@codemirror/lang-javascript@6.2.3').then((m) => m.javascript({ jsx: true, typescript: true })),
    python: () => import('${ESM}/@codemirror/lang-python@6.1.7').then((m) => m.python()),
    json: () => import('${ESM}/@codemirror/lang-json@6.0.1').then((m) => m.json()),
    rust: () => import('${ESM}/@codemirror/lang-rust@6.0.1').then((m) => m.rust()),
    go: () => import('${ESM}/@codemirror/lang-go@6.0.1').then((m) => m.go()),
    html: () => import('${ESM}/@codemirror/lang-html@6.4.9').then((m) => m.html()),
    css: () => import('${ESM}/@codemirror/lang-css@6.3.1').then((m) => m.css()),
    markdown: () => import('${ESM}/@codemirror/lang-markdown@6.3.2').then((m) => m.markdown()),
    text: () => Promise.resolve([]),
  };

  let changeTimer = null;
  let selTimer = null;
  const onDocChange = EditorView.updateListener.of((update) => {
    if (update.docChanged && !suppressChange) {
      if (changeTimer) clearTimeout(changeTimer);
      changeTimer = setTimeout(() => {
        post({ type: 'change', value: view.state.doc.toString() });
      }, 350);
    }
    if (update.selectionSet || update.docChanged) {
      if (selTimer) clearTimeout(selTimer);
      selTimer = setTimeout(() => {
        const sel = view.state.selection.main;
        const text = sel.empty ? '' : view.state.sliceDoc(sel.from, sel.to);
        // VS Code-style status bar payload: 1-based line / column of the cursor.
        const lineInfo = view.state.doc.lineAt(sel.head);
        post({
          type: 'selection',
          text: text.slice(0, 4000),
          line: lineInfo.number,
          col: sel.head - lineInfo.from + 1,
        });
      }, 220);
    }
  });

  const themeFor = (isDark, px) => [
    isDark ? oneDark : syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorView.theme({
      '&': { fontSize: px + 'px', height: '100%' },
      '.cm-scroller': { fontFamily: 'Menlo, Consolas, monospace', overflow: 'auto' },
      '.cm-content': { paddingBottom: '40vh' },
    }),
  ];

  async function vimExtension() {
    const mod = await import('${ESM}/@replit/codemirror-vim@6.2.1');
    return mod.vim();
  }

  /** Feature-switch extension builders — one per compartment. */
  const gutterExts = (o) => (o.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []);
  const wrapExts = (o) => (o.wordWrap ? [EditorView.lineWrapping] : []);
  const tabExts = (o) => [EditorState.tabSize.of(o.tabSize), indentUnit.of(' '.repeat(o.tabSize))];
  const activeExts = (o) => (o.activeLine ? [highlightActiveLine(), highlightSelectionMatches()] : []);
  const bracketExts = (o) =>
    o.brackets
      ? [bracketMatching(), closeBrackets(), keymap.of(closeBracketsKeymap)]
      : [];
  const completionExts = (o) =>
    o.autocomplete
      ? [autocompletion(), keymap.of(completionKeymap)]
      : [];
  const whitespaceExts = (o) =>
    o.whitespace ? [highlightWhitespace(), highlightTrailingWhitespace()] : [];

  const state = EditorState.create({
    doc: '',
    extensions: [
      history(),
      foldGutter(),
      drawSelection(),
      indentOnInput(),
      // VS Code-style find panel (Ctrl/Cmd+F) pinned to the top.
      search({ top: true }),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        indentWithTab,
      ]),
      Prec.highest(keymap.of([{
        key: 'Mod-s',
        run: () => { post({ type: 'save' }); return true; },
      }])),
      langCompartment.of([]),
      themeCompartment.of(themeFor(currentTheme, currentFontSize)),
      vimCompartment.of([]),
      gutterCompartment.of(gutterExts(opts)),
      wrapCompartment.of(wrapExts(opts)),
      tabCompartment.of(tabExts(opts)),
      activeCompartment.of(activeExts(opts)),
      bracketCompartment.of(bracketExts(opts)),
      completionCompartment.of(completionExts(opts)),
      whitespaceCompartment.of(whitespaceExts(opts)),
      onDocChange,
    ],
  });
  view = new EditorView({ state, parent: document.getElementById('editor') });

  async function setLanguage(lang) {
    currentLang = lang;
    try {
      const loader = langLoaders[lang] || langLoaders.text;
      const ext = await loader();
      view.dispatch({ effects: langCompartment.reconfigure(ext) });
    } catch (e) { post({ type: 'error', message: 'lang: ' + String(e) }); }
  }
  function setTheme(isDark) {
    currentTheme = isDark;
    document.body.style.background = isDark ? '#282c34' : '#ffffff';
    view.dispatch({ effects: themeCompartment.reconfigure(themeFor(isDark, currentFontSize)) });
  }
  function setFontSize(px) {
    currentFontSize = px;
    view.dispatch({ effects: themeCompartment.reconfigure(themeFor(currentTheme, px)) });
  }
  async function setVim(enabled) {
    vimEnabled = enabled;
    try {
      if (enabled) {
        const vimExt = await vimExtension();
        view.dispatch({ effects: vimCompartment.reconfigure(Prec.highest(vimExt)) });
      } else {
        view.dispatch({ effects: vimCompartment.reconfigure([]) });
      }
    } catch (e) { post({ type: 'error', message: 'vim: ' + String(e) }); }
  }
  function setValue(value) {
    if (value === view.state.doc.toString()) return;
    suppressChange = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    suppressChange = false;
  }

  function setOptions(next) {
    opts = Object.assign({}, opts, next || {});
    const effects = [
      gutterCompartment.reconfigure(gutterExts(opts)),
      wrapCompartment.reconfigure(wrapExts(opts)),
      tabCompartment.reconfigure(tabExts(opts)),
      activeCompartment.reconfigure(activeExts(opts)),
      bracketCompartment.reconfigure(bracketExts(opts)),
      completionCompartment.reconfigure(completionExts(opts)),
      whitespaceCompartment.reconfigure(whitespaceExts(opts)),
    ];
    view.dispatch({ effects });
  }

  function route(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'setValue') setValue(msg.value || '');
    else if (msg.type === 'setLanguage') void setLanguage(msg.lang);
    else if (msg.type === 'setTheme') setTheme(!!msg.dark);
    else if (msg.type === 'setFontSize') setFontSize(msg.px || 14);
    else if (msg.type === 'setVim') void setVim(!!msg.enabled);
    else if (msg.type === 'setOptions') setOptions(msg.options);
    else if (msg.type === 'revealLine') {
      const doc = view.state.doc;
      const line = doc.line(Math.max(1, Math.min(msg.line || 1, doc.lines)));
      view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
      });
      view.focus();
    }
    else if (msg.type === 'focus') view.focus();
  }
  // react-native-webview delivers postMessage on document (android) or window (ios)
  document.addEventListener('message', (e) => route(e.data));
  window.addEventListener('message', (e) => route(e.data));

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      post({ type: 'save' });
    }
  });

  post({ type: 'ready' });
}

main().catch((e) => post({ type: 'error', message: 'init: ' + String(e && e.stack || e) }));
</script>
</body>
</html>`;
}
