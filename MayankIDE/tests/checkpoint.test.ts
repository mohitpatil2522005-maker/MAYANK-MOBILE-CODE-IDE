/**
 * Tests for the checkpoint / review-logic module (Slice 2).
 */
import {
  applyDecisions,
  diffLineStats,
  diffSnapshots,
  pushCheckpoint,
  revertToCheckpoint,
  type Checkpoint,
} from '@/src/lib/editor/checkpoint';
import { harness } from './harness';

const t = harness('checkpoints');

const cp = (id: string, files: Record<string, string>, reason = 'r'): Checkpoint => ({
  id,
  ts: 1,
  reason,
  author: 'user',
  files,
});

t.section('ring buffer');

let buf: Checkpoint[] = [];
buf = pushCheckpoint(buf, cp('a', { x: '1' }));
buf = pushCheckpoint(buf, cp('b', { x: '2' }));
t.check('two entries preserved in order', buf.map((c) => c.id), ['a', 'b']);

const big = Array.from({ length: 5 }, (_, i) => cp(`m${i}`, {}));
let trimmed = big.slice(0, 3);
for (const c of big) trimmed = pushCheckpoint(trimmed, c, 3);
t.check('ring trims to size 3', trimmed.length, 3);
t.check('ring keeps newest three', trimmed.map((c) => c.id), ['m2', 'm3', 'm4']);

t.section('diffSnapshots');

// before: a x, b y, c z ; after: a x, b Y, c ABSENT, d NEW
const d = diffSnapshots({ a: 'x', b: 'y', c: 'z' }, { a: 'x', b: 'Y', d: 'new' });
t.check('detects modified file', d.find((x) => x.path === 'b')?.after, 'Y');
const deleted = d.find((x) => x.path === 'c');
t.check('detects deleted file', deleted?.deleted, true);
const added = d.find((x) => x.path === 'd');
t.check('detects added file', added?.added, true);
t.check('unchanged file excluded', d.find((x) => x.path === 'a'), undefined);

t.section('diffLineStats');

t.check(
  'stats for a changed file',
  diffLineStats({ path: 'a.ts', deleted: false, added: false, before: 'a\nb\nc', after: 'a\nx\nc' }),
  { added: 1, removed: 1 },
);
t.check(
  'stats for an added file',
  diffLineStats({ path: 'new.ts', deleted: false, added: true, before: '', after: 'p\nq\nr' }),
  { added: 3, removed: 0 },
);
t.check(
  'stats for a deleted file',
  diffLineStats({ path: 'old.ts', deleted: true, added: false, before: 'p\nq', after: '' }),
  { added: 0, removed: 2 },
);

t.section('applyDecisions');

const merged = applyDecisions({ a: '1', b: '2' }, { b: 'B', c: 'new' });
t.check('override + add', merged, { a: '1', b: 'B', c: 'new' });
t.check('empty string sentinel deletes', applyDecisions({ a: '1', b: '2' }, { a: null }).a, undefined);
  t.check('empty string preserved (not deleted)', applyDecisions({ a: '1', b: '2' }, { a: '' }).a, '');
  t.check('mixed: null deletes, empty preserves', applyDecisions({ a: '1', b: '2', c: '3' }, { a: null, b: '' }).a, undefined);
  t.check('mixed: b set to empty', applyDecisions({ a: '1', b: '2', c: '3' }, { a: null, b: '' }).b, '');

t.section('revertToCheckpoint is itself reversible');

const ring = [cp('target', { x: 'old' }, 'target'), cp('now', { x: 'new' })];
const currentFiles = { x: 'new', y: 'unchanged' };
const result = revertToCheckpoint(ring, 'target', currentFiles, 20);
t.check('restored files come from the target', result.restoredFiles, { x: 'old' });
t.check('a pre-revert checkpoint was added', result.buffer.length, 3);
const preRevert = result.buffer[result.buffer.length - 1];
t.check('pre-revert author is user', preRevert.author, 'user');
t.check('pre-revert captured current state', preRevert.files, currentFiles);
t.check('reverting to a missing id is a no-op', revertToCheckpoint(ring, 'nope', currentFiles).restoredFiles, currentFiles);

t.done();
