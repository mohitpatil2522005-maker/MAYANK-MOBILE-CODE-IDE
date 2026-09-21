/**
 * Fuzzy matcher (command palette / quick open): subsequence scoring,
 * boundary bonuses, ranking + tie-breaking, limits.
 * Run: npm test
 */
import { fuzzyScore, rankItems } from '../src/lib/search/fuzzy';
import { harness } from './harness';

const t = harness('fuzzy search');

t.section('fuzzyScore matching');
{
  t.check('empty query matches with 0', fuzzyScore('', 'src/App.tsx') > -1, true);
  t.check('whitespace query matches', fuzzyScore('  ', 'x.ts') > -1, true);
  t.check('exact substring matches', fuzzyScore('app', 'src/App.tsx') > -1, true);
  t.check('subsequence matches', fuzzyScore('sAtx', 'src/App.tsx') > -1, true);
  t.check('case-insensitive', fuzzyScore('APP', 'src/App.tsx') > -1, true);
  t.check('non-subsequence fails', fuzzyScore('xyz', 'src/App.tsx'), -1);
  t.check('order enforced (reversed query)', fuzzyScore('ba', 'ab.ts'), -1);
}

t.section('scoring heuristics');
{
  t.check(
    'consecutive beats spread out',
    fuzzyScore('compset', 'src/components/settings/schema.ts') >
      fuzzyScore('compset', 'cpp/mpx/se/tmp.ts'),
    true,
  );
  t.check(
    'boundary match beats mid-word',
    fuzzyScore('set', 'settings/a.ts') > fuzzyScore('set', 'cssSettingsTheme.ts'),
    true,
  );
  t.check(
    'shorter span preferred (penalty)',
    fuzzyScore('ab', 'ab.ts') > fuzzyScore('ab', 'a_long_dirname/b.ts'),
    true,
  );
  t.check('camelCase boundary bonus', fuzzyScore('et', 'editorTabs.ts') > 0, true);
}

t.section('rankItems');
{
  const files = [
    'src/components/editor/EditorTabs.tsx',
    'src/store/settingsStore.ts',
    'src/lib/settings/schema.ts',
    'app/(tabs)/settings.tsx',
    'README.md',
  ];
  const ranked = rankItems('settings', files, (p) => p, 10).map((r) => r.item);
  t.check('all settings matches returned', ranked.length, 3);
  t.check(
    'tightest span wins (settings/schema.ts first)',
    ranked[0].endsWith('settings/schema.ts'),
    true,
  );
  t.check('README dropped', ranked.includes('README.md'), false);

  const limited = rankItems('', ['a.ts', 'bb.ts', 'ccc.ts', 'dddd.ts'], (p) => p, 2);
  t.check('limit respected', limited.length, 2);
  t.check(
    'empty query → shortest first',
    limited.map((r) => r.item),
    ['a.ts', 'bb.ts'],
  );

  const tie = rankItems('e', ['be.ts', 'ae.ts'], (p) => p, 5).map((r) => r.item);
  t.check('ties → alpha order', tie, ['ae.ts', 'be.ts']);
}

t.done();
