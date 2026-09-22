/** Tool-call parsing, streaming strip, diff, prompt/history helpers (Phase 3). */
import { harness } from './harness';
import {
  extractToolCalls,
  stripStreamingToolText,
  toolSpecsForPrompt,
} from '../src/lib/ai/tools';
import {
  buildSystemPrompt,
  buildToolFeedbackMessage,
  capContent,
  packHistory,
  shallowTreePreview,
  countFiles,
} from '../src/lib/ai/agent';
import { computeLineDiff, collapseContext } from '../src/lib/diff';
import type { FileNode } from '../src/lib/fs/types';

const t = harness('tools + diff + prompt');

t.section('extractToolCalls');
{
  const r1 = extractToolCalls(
    'Let me read that.\n\n```tool\n{"tool": "read_file", "path": "src/index.ts"}\n```',
  );
  t.check('tool fence parsed', r1.calls[0]?.tool, 'read_file');
  t.check('path parsed', r1.calls[0]?.args.path, 'src/index.ts');
  t.check('text cleaned', r1.cleanText, 'Let me read that.');

  const r2 = extractToolCalls('```json\n{"tool": "edit_file", "path": "a.ts", "old_text": "x", "new_text": "y"}\n```');
  t.check('json fence with tool parsed', r2.calls[0]?.tool, 'edit_file');

  const r3 = extractToolCalls('```json\n{"name": "not-a-tool"}\n```');
  t.check('plain json fence untouched', r3.calls.length, 0);
  t.check('plain json fence kept visible', r3.cleanText.includes('not-a-tool'), true);

  const r4 = extractToolCalls('Sure! 🔧 TOOL_CALL: {"tool":"list_files","path":"src/"}');
  t.check('legacy line parsed', r4.calls[0]?.tool, 'list_files');

  const r5 = extractToolCalls('```tool\n{broken json\n```');
  t.check('malformed skipped + kept visible', r5.calls.length === 0 && r5.cleanText.includes('broken'), true);

  const r6 = extractToolCalls('```tool\n{"tool":"write_file","content":123,"replace_all":"true"}\n```');
  t.check('coercions applied', [typeof r6.calls[0]?.args.content, r6.calls[0]?.args.replace_all], ['string', true]);

  const r7 = extractToolCalls(
    'a\n```tool\n{"tool":"read_file","path":"x"}\n```\nb\n```tool\n{"tool":"search_code","pattern":"y"}\n```\nc',
  );
  t.check('multiple calls ordered', r7.calls.map((c) => c.tool), ['read_file', 'search_code']);
  t.check('surrounding text preserved', r7.cleanText, 'a\n\nb\n\nc');
}

t.section('stripStreamingToolText');
{
  t.check('no tool text unchanged', stripStreamingToolText('Hello world'), 'Hello world');
  t.check('trailing fence hidden', stripStreamingToolText('Explaining…\n```tool\n{"tool"'), 'Explaining…');
  t.check('trailing legacy hidden', stripStreamingToolText('Ok\n🔧 TOOL_CALL'), 'Ok');
  // Regression: a CLOSED json fence (ordinary example) stays visible, and
  // prose after a completed tool block is not swallowed mid-stream.
  t.check(
    'closed json fence stays visible',
    stripStreamingToolText('Here is an example:\n```json\n{"a":1}\n```\nDone!'),
    'Here is an example:\n```json\n{"a":1}\n```\nDone!',
  );
  t.check(
    'prose after completed tool block kept',
    stripStreamingToolText('Step 1:\n```tool\n{"tool":"read_file","path":"a.ts"}\n```\nNow step 2…'),
    'Step 1:\n```tool\n{"tool":"read_file","path":"a.ts"}\n```\nNow step 2…',
  );
  t.check(
    'only the unclosed trailing block is hidden',
    stripStreamingToolText('Done:\n```tool\n{"ok":1}\n```\nMore:\n```tool\n{"pa'),
    'Done:\n```tool\n{"ok":1}\n```\nMore:',
  );
  t.check('json5 fence is not a tool fence', stripStreamingToolText('x\n```json5\n{a:1}\n```\ny'), 'x\n```json5\n{a:1}\n```\ny');
}

t.section('diff');
{
  const d1 = computeLineDiff('a\nb\nc', 'a\nx\nc');
  t.check('counts', [d1.added, d1.removed], [1, 1]);
  t.check('change pair order', d1.lines.map((l) => l.type + ':' + l.text), ['same:a', 'remove:b', 'add:x', 'same:c']);
  const d2 = computeLineDiff('a', 'a\nb\nnew');
  t.check('pure additions', [d2.added, d2.removed], [2, 0]);
  const d3 = computeLineDiff('', '');
  t.check('empty text = one same line', [d3.added, d3.removed, d3.lines.length], [0, 0, 1]);
  const collapsed = collapseContext(
    Array.from({ length: 50 }, (_, i) => ({ type: 'same' as const, text: `l${i}` })),
  );
  t.check('long same-runs collapse', collapsed.some((l) => l.text.includes('unchanged lines')), true);
}

t.section('prompt helpers');
{
  const tree: FileNode[] = [
    { uri: 'r/src', name: 'src', path: 'src', type: 'directory', children: [
      { uri: 'r/src/a.ts', name: 'a.ts', path: 'src/a.ts', type: 'file' },
    ]},
    { uri: 'r/README.md', name: 'README.md', path: 'README.md', type: 'file' },
  ];
  t.check('countFiles', countFiles(tree), 2);
  const preview = shallowTreePreview(tree);
  t.check('tree preview has dir+file', preview.includes('📁 src/') && preview.includes('a.ts'), true);

  const big = 'x'.repeat(20000);
  const capped = capContent(big, 1000);
  t.check('capContent caps + notes', capped.length < 2000 && capped.includes('omitted'), true);

  const prompt = buildSystemPrompt({
    projectName: 'demo',
    fileCount: 2,
    currentFile: { path: 'src/a.ts', language: 'typescript', content: 'const a = 1;' },
    selection: 'const a',
    treePreview: preview,
  });
  t.check('prompt has identity', prompt.includes('Forge, an AI coding assistant'), true);
  t.check('prompt has file block', prompt.includes('src/a.ts') && prompt.includes('const a = 1;'), true);
  t.check('prompt has selection', prompt.includes('User selection'), true);
  t.check('prompt teaches protocol', prompt.includes('```tool') && prompt.includes('edit_file'), true);
  t.check('prompt forbids blind edits', prompt.includes('read a file before editing'), true);

  const history = packHistory([
    { role: 'user', content: 'old '.repeat(6000) },
    { role: 'assistant', content: 'mid' },
    { role: 'user', content: 'recent' },
  ]);
  t.check('recent turn always kept', history[history.length - 1].content, 'recent');

  const fb = buildToolFeedbackMessage([{ tool: 'read_file', status: 'ok', result: 'contents' }]);
  t.check('feedback format', fb.includes('TOOL_RESULTS') && fb.includes('"read_file"'), true);
  t.check('specs list all tools', toolSpecsForPrompt().includes('search_code'), true);
}

t.done();
