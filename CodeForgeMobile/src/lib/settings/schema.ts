/**
 * Declarative, VS Code-style settings schema — pure data, fully testable.
 *
 * Every user-tunable preference is a SettingDef with a dot-namespaced id
 * (like VS Code's `editor.fontSize`). The settings screen renders sections
 * and controls directly from SETTING_DEFS, and the search box filters via
 * filterSettings(). Store defaults are derived from the same defs so the
 * schema is the single source of truth.
 */

export type SettingSectionId = 'appearance' | 'editor' | 'features' | 'files';

export interface SettingSection {
  id: SettingSectionId;
  label: string;
}

export const SETTING_SECTIONS: SettingSection[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'editor', label: 'Editor' },
  { id: 'features', label: 'Editor Features' },
  { id: 'files', label: 'Files' },
];

interface SettingBase {
  /** VS Code-style identifier, e.g. "editor.fontSize" — shown in the UI. */
  id: string;
  /** Key in the persisted settings store (flat). */
  key: string;
  section: SettingSectionId;
  title: string;
  description: string;
  /** Extra terms matched by search (e.g. ["wrap", "soft wrap"]). */
  keywords?: string[];
}

export interface BooleanSetting extends SettingBase {
  kind: 'boolean';
  defaultValue: boolean;
}

export interface EnumSetting extends SettingBase {
  kind: 'enum';
  defaultValue: string;
  choices: { value: string; label: string }[];
}

export interface NumberSetting extends SettingBase {
  kind: 'number';
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  /** Rendered next to the value, e.g. "px". */
  unit?: string;
}

export type SettingDef = BooleanSetting | EnumSetting | NumberSetting;
export type SettingValue = boolean | string | number;

export const SETTING_DEFS: SettingDef[] = [
  // ─── Appearance ──────────────────────────────────────────────
  {
    kind: 'enum',
    id: 'workbench.colorTheme',
    key: 'themeMode',
    section: 'appearance',
    title: 'Color Theme',
    description: 'Controls the app color theme — system follows the OS setting.',
    keywords: ['dark', 'light', 'mode', 'appearance'],
    defaultValue: 'system',
    choices: [
      { value: 'system', label: 'System' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
  },

  // ─── Editor ──────────────────────────────────────────────────
  {
    kind: 'number',
    id: 'editor.fontSize',
    key: 'editorFontSize',
    section: 'editor',
    title: 'Font Size',
    description: 'Controls the editor font size in pixels.',
    keywords: ['text', 'zoom'],
    defaultValue: 14,
    min: 10,
    max: 24,
    step: 1,
    unit: 'px',
  },
  {
    kind: 'enum',
    id: 'editor.tabSize',
    key: 'tabSize',
    section: 'editor',
    title: 'Tab Size',
    description: 'The number of spaces a tab is equal to; also the indent unit.',
    keywords: ['indent', 'spaces', 'indentation'],
    defaultValue: '2',
    choices: [
      { value: '2', label: '2 spaces' },
      { value: '4', label: '4 spaces' },
      { value: '8', label: '8 spaces' },
    ],
  },
  {
    kind: 'boolean',
    id: 'editor.wordWrap',
    key: 'wordWrap',
    section: 'editor',
    title: 'Word Wrap',
    description: 'Controls how lines overflowing the viewport wrap. On is best for phones.',
    keywords: ['wrap', 'soft wrap', 'overflow'],
    defaultValue: true,
  },
  {
    kind: 'boolean',
    id: 'editor.lineNumbers',
    key: 'lineNumbersEnabled',
    section: 'editor',
    title: 'Line Numbers',
    description: 'Controls the display of line numbers in the gutter.',
    keywords: ['gutter', 'numbers'],
    defaultValue: true,
  },
  {
    kind: 'boolean',
    id: 'editor.vimMode',
    key: 'vimEnabled',
    section: 'editor',
    title: 'Vim Mode',
    description: 'Modal editing with Vim keybindings inside the CodeMirror surface.',
    keywords: ['vi', 'modal', 'keybindings'],
    defaultValue: false,
  },

  // ─── Editor Features ─────────────────────────────────────────
  {
    kind: 'boolean',
    id: 'editor.quickSuggestions',
    key: 'autocompleteEnabled',
    section: 'features',
    title: 'Autocomplete',
    description: 'Suggest completions while typing (Ctrl/Cmd+Space always works).',
    keywords: ['suggest', 'intellisense', 'completion'],
    defaultValue: true,
  },
  {
    kind: 'boolean',
    id: 'editor.renderLineHighlight',
    key: 'activeLineEnabled',
    section: 'features',
    title: 'Highlight Active Line',
    description: 'Highlights the line at the cursor and matches in the selection.',
    keywords: ['cursor', 'current line', 'selection matches'],
    defaultValue: true,
  },
  {
    kind: 'boolean',
    id: 'editor.matchBrackets',
    key: 'bracketsEnabled',
    section: 'features',
    title: 'Bracket Matching & Auto-Close',
    description: 'Highlight matching brackets and auto-close ( [ { " \' while typing.',
    keywords: ['auto close', 'pairs', 'parentheses'],
    defaultValue: true,
  },
  {
    kind: 'boolean',
    id: 'editor.renderWhitespace',
    key: 'whitespaceVisible',
    section: 'features',
    title: 'Render Whitespace',
    description: 'Show spaces, tabs and trailing whitespace as subtle glyphs.',
    keywords: ['spaces', 'tabs', 'invisible'],
    defaultValue: false,
  },

  // ─── Files ───────────────────────────────────────────────────
  {
    kind: 'boolean',
    id: 'files.autoSave',
    key: 'autoSave',
    section: 'files',
    title: 'Auto Save',
    description: 'Save dirty files ~1s after you stop typing. Ctrl/Cmd+S always saves.',
    keywords: ['save', 'persist'],
    defaultValue: false,
  },
];

/** Flat defaults derived from the schema — used by the settings store. */
export const SETTING_DEFAULTS: Record<string, SettingValue> = Object.fromEntries(
  SETTING_DEFS.map((def) => [def.key, def.defaultValue]),
);

/**
 * Filter settings for the VS Code-style search box.
 * Case-insensitive substring match over id, title, description, keywords and
 * section label. An empty/whitespace query returns everything.
 */
export function filterSettings(defs: SettingDef[], query: string): SettingDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return defs;
  const sectionLabel = (id: SettingSectionId) =>
    SETTING_SECTIONS.find((s) => s.id === id)?.label.toLowerCase() ?? '';
  return defs.filter((def) => {
    const haystack = [def.id, def.title, def.description, sectionLabel(def.section), ...(def.keywords ?? [])]
      .join(' ')
      .toLowerCase();
    // Every whitespace-separated term must match somewhere ("vim mode" etc).
    return q.split(/\s+/).every((term) => haystack.includes(term));
  });
}
