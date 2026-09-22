/**
 * VS Code theme engine: scope→tag mapping, color extraction, font styles,
 * precedence, bundled catalog integrity, tag-expression resolver.
 * Run: npm test
 */
import {
  BUNDLED_THEMES,
  getThemeSpec,
  vsCodeToEditorSpec,
  type VsCodeThemeJson,
} from '../src/lib/extensions/themes';
import { resolveTagExpr } from '../src/lib/extensions/tagScope';
import { harness } from './harness';

const t = harness('theme engine');

const DARK_VS: VsCodeThemeJson = {
  name: 'Unit Dark',
  type: 'dark',
  colors: {
    'editor.background': '#101010',
    'editor.foreground': '#e0e0e0',
    'editorLineNumber.foreground': '#555555',
    'editorCursor.foreground': '#ffcc00',
    'editor.selectionBackground': '#333333',
    'editor.lineHighlightBackground': '#181818',
  },
  tokenColors: [
    { scope: 'comment', settings: { foreground: '#777777', fontStyle: 'italic' } },
    { scope: ['string', 'string.quoted.double'], settings: { foreground: '#aabbcc' } },
    { scope: 'keyword.control,storage.type', settings: { foreground: '#cc77ff' } },
    { scope: 'constant.numeric', settings: { foreground: '#ff9900' } },
    { scope: 'entity.name.function', settings: { foreground: '#66ff66', fontStyle: 'bold' } },
    { scope: 'entity.unknown.scope.xyz', settings: { foreground: '#ffffff' } },
  ],
};

t.section('conversion — colors & dark flag');
{
  const spec = vsCodeToEditorSpec(DARK_VS);
  t.check('dark from type', spec.dark, true);
  t.check('background picked', spec.colors.background, '#101010');
  t.check('gutter fg from editorLineNumber', spec.colors.gutterForeground, '#555555');
  t.check('cursor picked', spec.colors.cursor, '#ffcc00');
  t.check(
    'gutter bg falls back to editor bg',
    vsCodeToEditorSpec({ type: 'dark', colors: { 'editor.background': '#101010' } }).colors
      .gutterBackground,
    '#101010',
  );
  t.check('light theme dark=false', vsCodeToEditorSpec({ type: 'light' }).dark, false);
  t.check(
    'missing colors → dark defaults',
    vsCodeToEditorSpec({ type: 'dark' }).colors.background.length > 0,
    true,
  );
}

t.section('conversion — syntax rules');
{
  const spec = vsCodeToEditorSpec(DARK_VS);
  const find = (tag: string) => spec.syntax.find((r) => r.scope.includes(tag));
  t.check('comment rule exists', find('comment')?.color, '#777777');
  t.check('comment italic fontStyle', find('comment')?.fontStyle, 'italic');
  t.check('string color', find('string')?.color, '#aabbcc');
  t.check('multi-scope array applied', find('string') !== undefined, true);
  t.check(
    'comma-separated scopes in one string',
    find('keyword')?.color,
    '#cc77ff',
  );
  t.check('numeric → number', find('number')?.color, '#ff9900');
  t.check('fn scope → function(variableName)', find('function(variableName)')?.color, '#66ff66');
  t.check('fn bold preserved', find('function(variableName)')?.fontStyle, 'bold');
  t.check('unknown scopes skipped', find('weirdTagName'), undefined);
  t.check('rules are JSON-safe', typeof JSON.stringify(spec.syntax), 'string');
}

t.section('catalog integrity');
{
  const ids = BUNDLED_THEMES.map((x) => x.id);
  t.check('catalog ids unique', new Set(ids).size === ids.length, true);
  t.check('four bundled themes', BUNDLED_THEMES.length, 4);
  t.check(
    'every bundled theme converts without crashing',
    BUNDLED_THEMES.every((x) => getThemeSpec(x.id) !== null),
    true,
  );
  t.check('null id → default', getThemeSpec(null), null);
  t.check('unknown id → default', getThemeSpec('nope'), null);
  const dracula = getThemeSpec('mayank-ide.theme-dracula');
  t.check('dracula dark', dracula?.dark, true);
  t.check('dracula bg', dracula?.colors.background, '#282a36');
  t.check(
    'dracula has keyword rule',
    dracula?.syntax.some((r) => r.scope.includes('keyword')),
    true,
  );
  const gh = getThemeSpec('mayank-ide.theme-github-light');
  t.check('github light type', gh?.dark, false);
}

t.section('tag expression resolver');
{
  // Minimal tags table mimicking @lezer/highlight's API.
  const tag = (name: string) => {
    const fn = (child: unknown) => ({ name, child });
    (fn as Record<string, unknown>).tagName = name;
    return fn;
  };
  const tags = { keyword: tag('keyword'), variableName: tag('variableName'), function: tag('function') };
  const kw = resolveTagExpr('keyword', tags) as Record<string, unknown> | null;
  t.check('plain tag resolved', kw !== null, true);
  t.check('unknown plain → null', resolveTagExpr('nope', tags), null);
  const fnVar = resolveTagExpr('function(variableName)', tags) as { name: string; child: unknown } | null;
  t.check('nested resolved', fnVar?.name, 'function');
  t.check('nested child is tag', !!(fnVar && fnVar.child), true);
  t.check('malformed → null', resolveTagExpr('function(', tags), null);
  t.check('empty → null', resolveTagExpr('', tags), null);
  t.check('unknown parent → null', resolveTagExpr('atom(x)', tags), null);
}

t.done();
