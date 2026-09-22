/**
 * expo-file-system/legacy stub (bundled into the golden test).
 * The golden test only exercises the in-memory demo project (demo:// URIs),
 * so every native FS function throws loudly if it is ever reached — a
 * silent no-op would hide a real bug.
 */
'use strict';
function unavailable(name) {
  return () => {
    throw new Error(`expo-file-system.${name} must not be called in the golden test (demo project only)`);
  };
}
const StorageAccessFramework = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (typeof prop === 'symbol') return undefined;
      return unavailable(`StorageAccessFramework.${String(prop)}`);
    },
  },
);
module.exports = {
  documentDirectory: '/tmp/mayank-golden-test/',
  readDirectoryAsync: unavailable('readDirectoryAsync'),
  readAsStringAsync: unavailable('readAsStringAsync'),
  writeAsStringAsync: unavailable('writeAsStringAsync'),
  makeDirectoryAsync: unavailable('makeDirectoryAsync'),
  getInfoAsync: unavailable('getInfoAsync'),
  moveAsync: unavailable('moveAsync'),
  deleteAsync: unavailable('deleteAsync'),
  StorageAccessFramework,
};
