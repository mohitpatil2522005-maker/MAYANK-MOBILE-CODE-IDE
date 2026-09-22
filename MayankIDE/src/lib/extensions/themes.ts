/**
 * VS Code theme (.json) → CodeMirror editor theme converter.
 *
 * Pure and serializable — the output EditorThemeSpec can cross the RN →
 * WebView bridge as JSON, so ONE engine drives both editor builds
 * (native WebView and @uiw/react-codemirror on web).
 *
 * Scope mapping covers the common TextMate scope families found in
 * community themes; longest-prefix-first wins (entity.name.function beats
 * entity.name.*, etc.). Unknown scopes are skipped, not fatal.
 */

/** ─── Input: a VS Code color-theme JSON document ───────────────── */

export interface VsCodeTokenColor {
  scope?: string | string[];
  name?: string;
  settings: { foreground?: string; background?: string; fontStyle?: string };
}

export interface VsCodeThemeJson {
  name?: string;
  type?: 'dark' | 'light';
  colors?: Record<string, string>;
  tokenColors?: VsCodeTokenColor[];
}

/** ─── Output: code-level theme spec (JSON-safe) ────────────────── */

export interface SyntaxRuleSpec {
  /** Tag expressions, e.g. "keyword", "function(variableName)". */
  scope: string[];
  color?: string;
  backgroundColor?: string;
  /** CSS font-style keywords joined by spaces, e.g. "italic", "bold". */
  fontStyle?: string;
}

export interface EditorThemeSpec {
  /** Fixed appearance of the editor surface when this theme is enabled. */
  dark: boolean;
  colors: {
    background: string;
    foreground: string;
    gutterBackground: string;
    gutterForeground: string;
    cursor: string;
    selection: string;
    activeLine: string;
  };
  syntax: SyntaxRuleSpec[];
}

/** ─── TextMate scope prefix → CodeMirror tag expression ────────── */

const SCOPE_MAP: Array<[string, string]> = [
  ['markup.underline.link', 'link'],
  ['string.other.link', 'link'],
  ['entity.name.function', 'function(variableName)'],
  ['support.function', 'function(variableName)'],
  ['meta.function-call', 'function(variableName)'],
  ['entity.name.type', 'typeName'],
  ['entity.name.class', 'typeName'],
  ['entity.other.inherited-class', 'typeName'],
  ['support.type', 'typeName'],
  ['support.class', 'typeName'],
  ['entity.name.tag', 'tagName'],
  ['entity.name.section', 'heading'],
  ['markup.heading', 'heading'],
  ['constant.numeric', 'number'],
  ['constant.language', 'atom'],
  ['constant.character', 'character'],
  ['keyword.control', 'keyword'],
  ['keyword.operator', 'operator'],
  ['keyword', 'keyword'],
  ['storage.type', 'keyword'],
  ['storage.modifier', 'modifier'],
  ['storage', 'keyword'],
  ['string.quoted', 'string'],
  ['string', 'string'],
  ['comment', 'comment'],
  ['variable.language', 'self'],
  ['variable.other.property', 'propertyName'],
  ['variable.other.object.property', 'propertyName'],
  ['support.type.property-name', 'propertyName'],
  ['entity.other.attribute-name', 'attributeName'],
  ['constant.other', 'constant'],
  ['constant', 'constant'],
  ['support.constant', 'constant'],
  ['entity.name.constant', 'constant'],
  ['variable', 'variableName'],
  ['variable.parameter', 'variableName'],
  ['entity.name.namespace', 'namespace'],
  ['entity.name.module', 'namespace'],
  ['markup.bold', 'strong'],
  ['markup.italic', 'emphasis'],
  ['punctuation', 'punctuation'],
  ['meta.brace', 'punctuation'],
  ['markup.quote', 'quote'],
  ['markup.raw', 'monospace'],
  ['markup.inline.raw', 'monospace'],
  ['invalid', 'invalid'],
];

function tagForScope(scope: string): string | null {
  const s = scope.trim().toLowerCase();
  for (const [prefix, tag] of SCOPE_MAP) {
    if (s === prefix || s.startsWith(prefix + '.') || s === prefix) return tag;
  }
  return null;
}

/** Normalize a VS Code fontStyle string (\"bold italic\") to CM keywords. */
function normalizeFontStyle(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const parts = raw
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p === 'bold' || p === 'italic' || p === 'underline');
  return parts.length ? parts.join(' ') : undefined;
}

const DARK_COLORS: EditorThemeSpec['colors'] = {
  background: '#282c34',
  foreground: '#abb2bf',
  gutterBackground: '#282c34',
  gutterForeground: '#495162',
  cursor: '#528bff',
  selection: '#3e4451',
  activeLine: '#2c313c',
};

const LIGHT_COLORS: EditorThemeSpec['colors'] = {
  background: '#ffffff',
  foreground: '#383a42',
  gutterBackground: '#ffffff',
  gutterForeground: '#9d9d9f',
  cursor: '#526fff',
  selection: '#e5e5e6',
  activeLine: '#f2f2f2',
};

/** Convert a VS Code theme document to a CodeMirror theme spec. */
export function vsCodeToEditorSpec(theme: VsCodeThemeJson): EditorThemeSpec {
  const dark = theme.type !== 'light';
  const base = dark ? { ...DARK_COLORS } : { ...LIGHT_COLORS };
  const colors = theme.colors ?? {};
  const pick = (key: string, fallback: string) => {
    const v = colors[key];
    return typeof v === 'string' && v.trim() ? v : fallback;
  };

  const syntax: SyntaxRuleSpec[] = [];
  const seen = new Set<string>();
  /** Later rules override earlier ones, so map LSTM order → CM order. */
  for (const tc of [...(theme.tokenColors ?? [])].reverse()) {
    const scopes = Array.isArray(tc.scope)
      ? tc.scope
      : typeof tc.scope === 'string'
        ? [tc.scope]
        : [];
    for (const raw of scopes) {
      // VS Code allows comma-separated scopes inside one string.
      for (const part of raw.split(',')) {
        const tag = tagForScope(part);
        if (!tag || seen.has(tag)) continue; // first effective rule wins
        seen.add(tag);
        const rule: SyntaxRuleSpec = { scope: [tag] };
        if (tc.settings.foreground) rule.color = tc.settings.foreground;
        if (tc.settings.background) rule.backgroundColor = tc.settings.background;
        const fs = normalizeFontStyle(tc.settings.fontStyle);
        if (fs) rule.fontStyle = fs;
        syntax.push(rule);
      }
    }
  }

  const background = pick('editor.background', base.background);
  return {
    dark,
    colors: {
      background,
      foreground: pick('editor.foreground', base.foreground),
      // VS Code behavior: the gutter inherits the editor background.
      gutterBackground: pick('editorGutter.background', background),
      gutterForeground: pick('editorLineNumber.foreground', base.gutterForeground),
      cursor: pick('editorCursor.foreground', base.cursor),
      selection: pick('editor.selectionBackground', base.selection),
      activeLine: pick('editor.lineHighlightBackground', base.activeLine),
    },
    syntax,
  };
}

/** ─── Built-in extension catalog (Phase 2 marketplace seed) ────── */

export interface ThemeExtension {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  theme: VsCodeThemeJson;
  /** Accent swatch shown on the marketplace card. */
  swatches: string[];
}

const TC = (
  scope: string | string[],
  foreground: string,
  fontStyle?: string,
): VsCodeTokenColor => ({ scope, settings: { foreground, ...(fontStyle ? { fontStyle } : {}) } });

export const BUNDLED_THEMES: ThemeExtension[] = [
  {
    id: 'mayank-ide.theme-dracula',
    name: 'Dracula',
    publisher: 'mayank-ide',
    version: '1.0.0',
    description: 'The famous dark theme — purple keywords, cyan functions.',
    swatches: ['#282a36', '#ff79c6', '#50fa7b'],
    theme: {
      name: 'Dracula',
      type: 'dark',
      colors: {
        'editor.background': '#282a36',
        'editor.foreground': '#f8f8f2',
        'editorCursor.foreground': '#f8f8f0',
        'editor.selectionBackground': '#44475a',
        'editor.lineHighlightBackground': '#44475a59',
        'editorLineNumber.foreground': '#6272a4',
        'editorGutter.background': '#282a36',
      },
      tokenColors: [
        TC('comment', '#6272a4', 'italic'),
        TC(['string', 'string.quoted'], '#f1fa8c'),
        TC(['constant.numeric', 'constant.language', 'constant.character'], '#bd93f9'),
        TC(['keyword', 'storage.type', 'storage.modifier'], '#ff79c6'),
        TC('keyword.operator', '#ff79c6'),
        TC(['entity.name.function', 'support.function', 'meta.function-call'], '#50fa7b'),
        TC(['entity.name.type', 'entity.name.class', 'support.type'], '#8be9fd', 'italic'),
        TC(['variable.other.property', 'support.type.property-name'], '#66d9ef'),
        TC('variable', '#f8f8f2'),
        TC(['entity.name.tag', 'markup.heading'], '#ff79c6'),
        TC(['markup.bold'], '#ffb86c', 'bold'),
        TC(['markup.italic'], '#f1fa8c', 'italic'),
        TC(['markup.raw', 'markup.inline.raw'], '#50fa7b'),
        TC('invalid', '#ff5555'),
        TC(['markup.underline.link', 'string.other.link'], '#8be9fd', 'underline'),
      ],
    },
  },
  {
    id: 'mayank-ide.theme-monokai',
    name: 'Monokai',
    publisher: 'mayank-ide',
    version: '1.0.0',
    description: 'The Sublime Text classic — pink keywords, yellow strings.',
    swatches: ['#272822', '#f92672', '#a6e22e'],
    theme: {
      name: 'Monokai',
      type: 'dark',
      colors: {
        'editor.background': '#272822',
        'editor.foreground': '#f8f8f2',
        'editorCursor.foreground': '#f8f8f0',
        'editor.selectionBackground': '#49483e',
        'editor.lineHighlightBackground': '#3e3d32',
        'editorLineNumber.foreground': '#90908a',
        'editorGutter.background': '#272822',
      },
      tokenColors: [
        TC('comment', '#75715e', 'italic'),
        TC('string', '#e6db74'),
        TC(['constant.numeric', 'constant.language'], '#ae81ff'),
        TC(['keyword', 'storage'], '#f92672'),
        TC('keyword.operator', '#f92672'),
        TC(['entity.name.function', 'support.function'], '#a6e22e'),
        TC(['entity.name.type', 'entity.name.class', 'support.type'], '#66d9ef', 'italic'),
        TC(['variable.other.property', 'support.type.property-name'], '#a6e22e'),
        TC('variable.parameter', '#fd971f', 'italic'),
        TC('variable', '#f8f8f2'),
        TC(['markup.bold'], '#ae81ff', 'bold'),
        TC(['markup.italic'], '#fd971f', 'italic'),
        TC('markup.raw', '#e6db74'),
        TC('invalid', '#f92672'),
      ],
    },
  },
  {
    id: 'mayank-ide.theme-github-light',
    name: 'GitHub Light',
    publisher: 'mayank-ide',
    version: '1.0.0',
    description: 'Clean, bright, paper-like — the GitHub default look.',
    swatches: ['#ffffff', '#cf222e', '#0550ae'],
    theme: {
      name: 'GitHub Light',
      type: 'light',
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#24292f',
        'editorCursor.foreground': '#0969da',
        'editor.selectionBackground': '#0969da26',
        'editor.lineHighlightBackground': '#f6f8fa',
        'editorLineNumber.foreground': '#8c959f',
        'editorGutter.background': '#ffffff',
      },
      tokenColors: [
        TC('comment', '#57606a', 'italic'),
        TC(['string', 'string.quoted'], '#0a3069'),
        TC(['constant.numeric', 'constant.language'], '#0550ae'),
        TC(['keyword', 'storage', 'keyword.operator'], '#cf222e'),
        TC(['entity.name.function', 'support.function'], '#8250df'),
        TC(['entity.name.type', 'entity.name.class', 'support.type'], '#953800'),
        TC(['variable.other.property', 'support.type.property-name'], '#116329'),
        TC(['markup.bold'], '#24292f', 'bold'),
        TC(['markup.italic'], '#24292f', 'italic'),
        TC('markup.heading', '#0550ae', 'bold'),
        TC('markup.raw', '#0a3069'),
        TC('invalid', '#82071e'),
      ],
    },
  },
  {
    id: 'mayank-ide.theme-tokyo-night',
    name: 'Tokyo Night',
    publisher: 'mayank-ide',
    version: '1.0.0',
    description: 'A deep, neon-tinted night over the city skyline.',
    swatches: ['#1a1b26', '#bb9af7', '#7aa2f7'],
    theme: {
      name: 'Tokyo Night',
      type: 'dark',
      colors: {
        'editor.background': '#1a1b26',
        'editor.foreground': '#c0caf5',
        'editorCursor.foreground': '#c0caf5',
        'editor.selectionBackground': '#33467c66',
        'editor.lineHighlightBackground': '#1e202e',
        'editorLineNumber.foreground': '#3b4261',
        'editorGutter.background': '#1a1b26',
      },
      tokenColors: [
        TC('comment', '#565f89', 'italic'),
        TC('string', '#9ece6a'),
        TC(['constant.numeric', 'constant.language'], '#ff9e64'),
        TC(['keyword', 'storage', 'keyword.operator'], '#bb9af7'),
        TC(['entity.name.function', 'support.function', 'meta.function-call'], '#7aa2f7'),
        TC(['entity.name.type', 'entity.name.class', 'support.type'], '#2ac3de'),
        TC(['variable.other.property', 'support.type.property-name'], '#73daca'),
        TC('variable.parameter', '#e0af68'),
        TC('variable.language', '#f7768e'),
        TC(['markup.bold'], '#e0af68', 'bold'),
        TC('markup.heading', '#7aa2f7', 'bold'),
        TC('markup.raw', '#9ece6a'),
        TC('invalid', '#f7768e'),
      ],
    },
  },
];

/** Resolve an enabled theme id to an editor spec (null → built-in default). */
export function getThemeSpec(themeId: string | null): EditorThemeSpec | null {
  if (!themeId) return null;
  const ext = BUNDLED_THEMES.find((t) => t.id === themeId);
  return ext ? vsCodeToEditorSpec(ext.theme) : null;
}
