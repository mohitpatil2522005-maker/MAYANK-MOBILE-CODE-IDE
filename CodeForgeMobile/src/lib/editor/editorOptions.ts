/**
 * CodeMirror feature switches shared by the native (WebView) and web editor
 * builds. Mirrors the settings schema keys in src/lib/settings/schema.ts.
 */
export interface EditorOptions {
  /** Spaces per indent level (2 | 4 | 8). */
  tabSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  autocomplete: boolean;
  activeLine: boolean;
  brackets: boolean;
  whitespace: boolean;
}

export const DEFAULT_EDITOR_OPTIONS: EditorOptions = {
  tabSize: 2,
  wordWrap: true,
  lineNumbers: true,
  autocomplete: true,
  activeLine: true,
  brackets: true,
  whitespace: false,
};
