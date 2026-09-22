/**
 * Filename → CodeMirror language id mapping.
 * Kept deliberately small for the MVP; lazy loaders live in the editor
 * components so language parsers are only bundled/loaded on demand.
 */
export type LanguageId =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'json'
  | 'rust'
  | 'go'
  | 'html'
  | 'css'
  | 'markdown'
  | 'text';

const EXT_MAP: Record<string, LanguageId> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  py: 'python',
  pyw: 'python',
  json: 'json',
  jsonc: 'json',
  rs: 'rust',
  go: 'go',
  html: 'html',
  htm: 'html',
  css: 'css',
  md: 'markdown',
  markdown: 'markdown',
};

export function languageFromFilename(name: string): LanguageId {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return 'text';
  return EXT_MAP[name.slice(dot + 1).toLowerCase()] ?? 'text';
}

export const LANGUAGE_LABELS: Record<LanguageId, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  json: 'JSON',
  rust: 'Rust',
  go: 'Go',
  html: 'HTML',
  css: 'CSS',
  markdown: 'Markdown',
  text: 'Plain text',
};
