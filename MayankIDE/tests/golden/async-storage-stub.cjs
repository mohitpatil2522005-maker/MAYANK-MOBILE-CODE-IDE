/**
 * In-memory AsyncStorage stub (bundled into the golden test).
 * The real package's web build is ESM-only; a Map-backed instance gives the
 * stores deterministic, inspectable persistence under plain Node.
 */
'use strict';
const store = new Map();
const api = {
  getItem: async (key) => (store.has(key) ? store.get(key) : null),
  setItem: async (key, value) => {
    store.set(key, String(value));
  },
  removeItem: async (key) => {
    store.delete(key);
  },
  clear: async () => {
    store.clear();
  },
  __store: store,
};
api.default = api;
module.exports = api;
