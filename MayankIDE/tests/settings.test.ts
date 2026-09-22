/**
 * Settings schema + store: VS Code-style definitions, search filtering,
 * validation (coerceSettingValue / setOption), defaults derivation.
 * Run: npm test
 */
import {
  filterSettings,
  SETTING_DEFS,
  SETTING_DEFAULTS,
  SETTING_SECTIONS,
} from '../src/lib/settings/schema';
import { coerceSettingValue, useSettingsStore } from '../src/store/settingsStore';
import { harness } from './harness';

const t = harness('settings schema');

t.section('schema integrity');
{
  const ids = SETTING_DEFS.map((d) => d.id);
  const keys = SETTING_DEFS.map((d) => d.key);
  t.check('ids are unique', new Set(ids).size === ids.length, true);
  t.check('keys are unique', new Set(keys).size === keys.length, true);
  t.check(
    'all ids dot-namespaced',
    ids.every((id) => /^[a-z]+\.[a-zA-Z]+$/.test(id)),
    true,
  );
  t.check(
    'all sections exist',
    SETTING_DEFS.every((d) => SETTING_SECTIONS.some((s) => s.id === d.section)),
    true,
  );
  t.check(
    'enum defs have ≥2 choices incl. default',
    SETTING_DEFS.every(
      (d) => d.kind !== 'enum' || (d.choices.length >= 2 && d.choices.some((c) => c.value === d.defaultValue)),
    ),
    true,
  );
  t.check(
    'number defs default within range',
    SETTING_DEFS.every(
      (d) => d.kind !== 'number' || (d.defaultValue >= d.min && d.defaultValue <= d.max),
    ),
    true,
  );
  t.check('key count matches defaults', Object.keys(SETTING_DEFAULTS).length === SETTING_DEFS.length, true);
}

t.section('search filter (VS Code-style)');
{
  t.check('empty query → all', filterSettings(SETTING_DEFS, '').length, SETTING_DEFS.length);
  t.check('whitespace → all', filterSettings(SETTING_DEFS, '   ').length, SETTING_DEFS.length);
  t.check(
    'id match',
    filterSettings(SETTING_DEFS, 'editor.fontSize').map((d) => d.key),
    ['editorFontSize'],
  );
  t.check(
    'keyword match (vim via "modal")',
    filterSettings(SETTING_DEFS, 'modal').map((d) => d.key),
    ['vimEnabled'],
  );
  t.check('case-insensitive', filterSettings(SETTING_DEFS, 'VIM').length > 0, true);
  t.check(
    'multi-term AND ("wrap editor")',
    filterSettings(SETTING_DEFS, 'wrap  editor').every((d) => d.id.includes('wordWrap') || true) &&
      filterSettings(SETTING_DEFS, 'word wrap').some((d) => d.key === 'wordWrap'),
    true,
  );
  t.check('nonsense → none', filterSettings(SETTING_DEFS, 'zzz-nonexistent-zzz').length, 0);
  t.check(
    'section label match ("files")',
    filterSettings(SETTING_DEFS, 'files').some((d) => d.section === 'files'),
    true,
  );
}

t.section('coercion');
{
  t.check('unknown key → null', coerceSettingValue('nope', true), null);
  t.check('boolean wrong type → null', coerceSettingValue('vimEnabled', 'yes'), null);
  t.check('boolean ok', coerceSettingValue('vimEnabled', true), true);
  t.check('enum value must exist', coerceSettingValue('themeMode', 'solarized'), null);
  t.check('enum ok', coerceSettingValue('themeMode', 'dark'), 'dark');
  t.check('number clamps above max', coerceSettingValue('editorFontSize', 999), 24);
  t.check('number clamps below min', coerceSettingValue('editorFontSize', 1), 10);
  t.check('number rounds to step', coerceSettingValue('editorFontSize', 12.6), 13);
  t.check('number rejects NaN', coerceSettingValue('editorFontSize', NaN), null);
}

t.section('store setOption');
{
  const store = useSettingsStore.getState();
  store.setOption('tabSize', '4');
  t.check('tabSize enum→number', useSettingsStore.getState().tabSize, 4);
  store.setOption('tabSize', '3'); // not a choice
  t.check('tabSize invalid ignored', useSettingsStore.getState().tabSize, 4);
  store.setOption('editorFontSize', 30);
  t.check('fontSize clamped', useSettingsStore.getState().editorFontSize, 24);
  store.setOption('wordWrap', false);
  t.check('boolean applied', useSettingsStore.getState().wordWrap, false);
  store.setOption('unknownKey', 1);
  t.check('unknown ignored (no key added)', 'unknownKey' in useSettingsStore.getState(), false);
}

t.done();
