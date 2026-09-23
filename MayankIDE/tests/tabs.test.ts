/**
 * Adjacent-tab selection used by projectStore.closeFile (Fix #8).
 * Extracted into src/lib/editor/tabs.ts as a pure helper so it can be
 * tested without pulling React Native / AsyncStorage into the runner.
 */
import { harness } from './harness';
import { adjacentActiveUri } from '@/src/lib/editor/tabs';

const t = harness('editor tabs');

t.section('adjacentActiveUri (close activates neighbour)');

const uris = ['a', 'b', 'c'];
t.check('middle tab closes → left neighbour', adjacentActiveUri(uris, 'b'), 'a');
t.check('last tab closes → left neighbour', adjacentActiveUri(uris, 'c'), 'b');
t.check('first tab closes → right neighbour', adjacentActiveUri(uris, 'a'), 'b');
t.check('only tab closes → none active', adjacentActiveUri(['only'], 'only'), null);
t.check('unknown uri → none (no phantom tab)', adjacentActiveUri(uris, 'zzz'), null);
t.check('two tabs, close first → second', adjacentActiveUri(['x', 'y'], 'x'), 'y');
t.check('two tabs, close second → first', adjacentActiveUri(['x', 'y'], 'y'), 'x');

t.done();