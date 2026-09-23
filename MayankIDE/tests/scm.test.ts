/**
 * Tests for the git source-control model (Slice 4).
 */
import {
  commitTypePrefix,
  diffStatLabel,
  groupFiles,
  totalDiffStats,
  validateCommitMessage,
  type GitFileEntry,
} from '@/src/lib/git/scm';
import { harness } from './harness';

const t = harness('scm');

const entry = (
  path: string,
  status: GitFileEntry['status'],
  staged: boolean,
  extra: Partial<GitFileEntry> = {},
): GitFileEntry => ({ path, status, staged, ...extra });

t.section('groupFiles');

const files: GitFileEntry[] = [
  entry('a.ts', 'modified', true, { added: 1, removed: 2 }),
  entry('b.ts', 'modified', false, { added: 3, removed: 0 }),
  entry('c.ts', 'untracked', false),
  entry('d.ts', 'added', true),
];
const g = groupFiles(files);
t.check('staged group', g.staged.map((f) => f.path), ['a.ts', 'd.ts']);
t.check('unstaged group', g.unstaged.map((f) => f.path), ['b.ts']);
t.check('untracked group', g.untracked.map((f) => f.path), ['c.ts']);
t.check('groups are sorted by path', groupFiles([entry('z.ts', 'modified', false), entry('a.ts', 'modified', false)]).unstaged[0].path, 'a.ts');

t.section('diffStatLabel');

t.check('renders +/− label', diffStatLabel(entry('a.ts', 'modified', true, { added: 12, removed: 3 })), '+12 −3');
t.check('no stats → null', diffStatLabel(entry('a.ts', 'modified', true)), null);

t.section('validateCommitMessage');

t.check('empty rejected', validateCommitMessage('   '), { ok: false, error: 'Commit message is required' });
t.check('valid', validateCommitMessage('fix: bug').ok, true);
t.check('over long rejected', validateCommitMessage('x'.repeat(20_001)).ok, false);
t.check('exactly max ok', validateCommitMessage('x'.repeat(20_000)).ok, true);

t.section('commitTypePrefix');

t.check('detects feat', commitTypePrefix('feat: add x'), 'feat');
t.check('detects fix', commitTypePrefix('Fix the bug'), 'fix');
t.check('unknown → empty', commitTypePrefix('random stuff'), '');

t.section('totalDiffStats');

const stats = totalDiffStats([
  entry('a.ts', 'modified', true, { added: 5, removed: 1 }),
  entry('b.ts', 'modified', false, { added: 2, removed: 2 }),
  entry('c.ts', 'untracked', false),
]);
t.check('counts files with stats', stats.count, 2);
t.check('sums added', stats.added, 7);
t.check('sums removed', stats.removed, 3);

t.done();
