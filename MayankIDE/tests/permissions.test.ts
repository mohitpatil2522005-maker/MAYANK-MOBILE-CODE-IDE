/**
 * Tests for the permission engine (Slice 3, §9.3b).
 */
import {
  evaluatePermission,
  normalizeTarget,
  type PermissionRule,
  type PermRequest,
} from '@/src/lib/permissions/engine';
import { harness } from './harness';

const t = harness('permissions');

const rule = (action: PermissionRule['action'], target: string, decision: PermissionRule['decision']): PermissionRule => ({
  action,
  target,
  decision,
});

const req = (action: PermRequest['action'], target: string): PermRequest => ({ action, target });

t.section('normalizeTarget');
t.check('backslash → slash', normalizeTarget('C:\\proj\\src\\a.ts').replace(/^C:\/\//, ''), 'C:/proj/src/a.ts');
t.check('double slashes collapse', normalizeTarget('a//b///c'), 'a/b/c');
t.check('empty target', normalizeTarget(''), '');

t.section('basic exact matching');

t.check(
  'allow read exact',
  evaluatePermission([rule('read_file', 'src/a.ts', 'allow')], req('read_file', 'src/a.ts')).decision,
  'allow',
);
t.check(
  'no rule → ask (secure default)',
  evaluatePermission([], req('read_file', 'x.ts')).decision,
  'ask',
);
t.check(
  'no rule, read_url → ask',
  evaluatePermission([], req('read_url', 'https://example.com')).decision,
  'ask',
);
t.check(
  'deny beats allow',
  evaluatePermission(
    [rule('read_file', 'src/**', 'allow'), rule('read_file', 'src/secrets.ts', 'deny')],
    req('read_file', 'src/secrets.ts'),
  ).decision,
  'deny',
);
t.check(
  'ask beats allow',
  evaluatePermission(
    [rule('command', 'npm test', 'allow'), rule('command', '*', 'ask')],
    req('command', 'npm test'),
  ).decision,
  'ask',
);

t.section('implicit rules');

t.check(
  'allow write implies allow read on same target',
  evaluatePermission([rule('write_file', 'src/a.ts', 'allow')], req('read_file', 'src/a.ts')).decision,
  'allow',
);
t.check(
  'deny read implies deny write on same target',
  evaluatePermission([rule('read_file', 'src/a.ts', 'deny')], req('write_file', 'src/a.ts')).decision,
  'deny',
);
t.check(
  'allow read does NOT imply allow write',
  evaluatePermission([rule('read_file', 'src/a.ts', 'allow')], req('write_file', 'src/a.ts')).decision,
  'ask',
);

t.section('wildcards & subtrees');

t.check(
  'subtree ** matches descendants',
  evaluatePermission([rule('read_file', 'src/**', 'allow')], req('read_file', 'src/deep/nested/a.ts')).decision,
  'allow',
);
t.check(
  'subtree ** matches the dir itself',
  evaluatePermission([rule('read_file', 'src/**', 'allow')], req('read_file', 'src')).decision,
  'allow',
);
t.check(
  'subtree does NOT match outside',
  evaluatePermission([rule('read_file', 'src/**', 'allow')], req('read_file', 'lib/a.ts')).decision,
  'ask',
);
t.check(
  'whole-target * matches anything',
  evaluatePermission([rule('command', '*', 'deny')], req('command', 'rm -rf /')).decision,
  'deny',
);
t.check(
  'prefix wildcard src/* matches src/x',
  evaluatePermission([rule('read_file', 'src/*', 'allow')], req('read_file', 'src/x.ts')).decision,
  'allow',
);

t.section('regex targets');

t.check(
  'regex rule matches',
  evaluatePermission(
    [rule('read_file', 'regex:^src/app\\.secret$', 'deny')],
    req('read_file', 'src/app.secret'),
  ).decision,
  'deny',
);
t.check(
  'regex rule does not match',
  evaluatePermission(
    [rule('read_file', 'regex:^src/app\\.secret$', 'deny')],
    req('read_file', 'src/app.ts'),
  ).decision,
  'ask',
);

t.section('matched rule + reason');

const res = evaluatePermission([rule('read_file', 'src/**', 'allow')], req('read_file', 'src/x.ts'));
t.check('matched rule is populated', res.matched !== null, true);
t.check('reason names the rule', res.reason, 'Allowed by rule "src/**"');

const dflt = evaluatePermission([], req('read_file', 'src/x.ts'));
t.check('default has null matched', dflt.matched, null);
t.check('default reason is secure-by-default', dflt.reason, 'No rule matched — default is ask (secure by default)');

t.section('destructive git defaults to ask');
t.check(
  'git push unconfigured → ask',
  evaluatePermission([rule('command', '*', 'allow')], req('command', 'git push')).decision,
  'allow',
);
t.check(
  'specific destructive rule wins over broad allow',
  evaluatePermission(
    [rule('command', '*', 'allow'), rule('command', 'git push', 'ask')],
    req('command', 'git push'),
  ).decision,
  'ask',
);

t.done();
