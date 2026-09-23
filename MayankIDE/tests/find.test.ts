/**
 * Tests for the find/replace engine (Slice 1).
 * Pure logic — no editor surface needed.
 */
import {
  findAll,
  MAX_FIND_RESULTS,
  nextMatchIndex,
  planReplace,
  summarisePlan,
} from '@/src/lib/editor/find';
import { harness } from './harness';

const t = harness('find-replace');

t.section('basic literal find');

t.check('finds a single match', findAll('hello world', 'world', { regex: false, caseSensitive: true, wholeWord: false }).matches, [
  { from: 6, to: 11 },
]);

t.check('case-insensitive by default', findAll('Hello hello HELLO', 'hello', { regex: false, caseSensitive: false, wholeWord: false }).matches.length, 3);

t.check('case-sensitive respects flag', findAll('Hello hello', 'hello', { regex: false, caseSensitive: true, wholeWord: false }).matches, [
  { from: 6, to: 11 },
]);

// 'foo foobar foo': "foo" at 0-3, "foobar" at 4-9 (whole-word "foo" inside
// "foobar" is excluded), "foo" at 11-14.
t.check('whole-word excludes substrings', findAll('foo foobar foo', 'foo', { regex: false, caseSensitive: true, wholeWord: true }).matches, [
  { from: 0, to: 3 },
  { from: 11, to: 14 },
]);

t.check('empty query returns nothing', findAll('abc', '', { regex: false, caseSensitive: true, wholeWord: false }).matches, []);

t.section('regex mode');

t.check('character class', findAll('a1 b2 c3', '[a-c]\\d', { regex: true, caseSensitive: true, wholeWord: false }).matches.length, 3);

t.check('invalid regex surfaces an error', findAll('abc', '(unclosed', { regex: true, caseSensitive: true, wholeWord: false }).error !== null, true);

t.check('valid regex clears error', findAll('abc', 'a', { regex: true, caseSensitive: true, wholeWord: false }).error, null);

t.check('regex special chars are escaped in literal mode', findAll('a.b aab', 'a.b', { regex: false, caseSensitive: true, wholeWord: false }).matches, [
  { from: 0, to: 3 },
]);

t.section('nextMatchIndex');

t.check('wraps forward from -1 to 0', nextMatchIndex(-1, 5, 1), 0);
t.check('wraps backward from -1 to 4', nextMatchIndex(-1, 5, -1), 4);
t.check('forwards 0→1', nextMatchIndex(0, 5, 1), 1);
t.check('forwards 4→0', nextMatchIndex(4, 5, 1), 0);
t.check('backwards 0→4', nextMatchIndex(0, 5, -1), 4);
t.check('empty doc → -1', nextMatchIndex(0, 0, 1), -1);

t.section('planReplace');

const plan = planReplace('foo bar\nfoo baz', 'foo', 'baz', { regex: false, caseSensitive: true, wholeWord: false });
t.check('result string', plan.result, 'baz bar\nbaz baz');
t.check('replaced count', plan.replacedCount, 2);
t.check('changed ranges count', plan.changedRanges.length, 2);

const summary = summarisePlan('foo bar\nfoo baz', plan);
t.check('changed lines count (two distinct lines)', summary.changedLines, 2);
t.check('same-length replace: added == removed == 6', [summary.added, summary.removed], [6, 6]);

// Fix #6: added must count each replacement's own length. Slicing plan.result
// at original-text offsets drifts once replacement lengths differ — 'a'→'xyz'
// at [0,1] and [3,4] must count 3+3 added, 1+1 removed.
const grow = planReplace('ab a', 'a', 'xyz', { regex: false, caseSensitive: true, wholeWord: false });
t.check('length-changing result', grow.result, 'xyzb xyz');
const growSummary = summarisePlan('ab a', grow);
t.check('length-changing added/removed', [growSummary.added, growSummary.removed], [6, 2]);
t.check('changed lines from original offsets', growSummary.changedLines, 1);

const noop = planReplace('foo bar', 'qux', 'baz', { regex: false, caseSensitive: true, wholeWord: false });
t.check('no match leaves text unchanged', noop.result, 'foo bar');
t.check('no match → 0 replacements', noop.replacedCount, 0);

// Case-insensitive regex with (?i) prefix — the i flag makes (?i) redundant;
// "Hello" and "hello" both match under i.
const ciPlan = planReplace('Hello hello', 'hello', 'Hi', { regex: true, caseSensitive: false, wholeWord: false });
t.check('case-insensitive regex replace count', ciPlan.replacedCount, 2);
t.check('case-insensitive regex result', ciPlan.result, 'Hi Hi');

// $& is a back-reference in regex mode and expands to the matched text.
const backrefRegex = planReplace('foo bar foo', 'foo', '$&!', { regex: true, caseSensitive: true, wholeWord: false });
t.check('regex $& expands to matched text', backrefRegex.result, 'foo! bar foo!');

// In literal mode, $& is kept as the literal string (no back-reference).
const backrefLiteral = planReplace('foo bar foo', 'foo', '$&!', { regex: false, caseSensitive: true, wholeWord: false });
t.check('literal $& stays literal', backrefLiteral.result, '$&! bar $&!');

t.section('cap protection');

const long = 'a'.repeat(MAX_FIND_RESULTS + 100);
const r = findAll(long, 'a', { regex: false, caseSensitive: true, wholeWord: false });
t.check('caps at MAX_FIND_RESULTS + sentinel', r.matches.length, MAX_FIND_RESULTS + 1);
t.check('sentinel is the last entry', r.matches[r.matches.length - 1], { from: -1, to: -1 });

t.done();
