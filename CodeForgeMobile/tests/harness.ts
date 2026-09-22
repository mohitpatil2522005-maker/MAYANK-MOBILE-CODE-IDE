/**
 * Tiny assertion harness for the pure-logic test suites.
 * Each suite: const t = harness('suite-name'); t.check(...); t.done();
 *
 * Importing this module also stubs window.localStorage so zustand/persist
 * writes (AsyncStorage's web build reads window at *call* time) work under
 * plain Node/tsx instead of throwing unhandled rejections.
 */
const memoryStorage = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
if (typeof g.window === 'undefined') g.window = {};
(g.window as Record<string, unknown>).localStorage = {
  getItem: (key: string) => (memoryStorage.has(key) ? memoryStorage.get(key)! : null),
  setItem: (key: string, value: string) => void memoryStorage.set(key, String(value)),
  removeItem: (key: string) => void memoryStorage.delete(key),
  clear: () => memoryStorage.clear(),
  get length() {
    return memoryStorage.size;
  },
  key: (index: number) => [...memoryStorage.keys()][index] ?? null,
};

export interface Harness {
  check(name: string, actual: unknown, expected: unknown): void;
  section(title: string): void;
  done(): void;
}

export function harness(suiteName: string): Harness {
  let failures = 0;
  let passed = 0;
  console.log(`\n=== ${suiteName} ===`);
  return {
    section(title) {
      console.log(` ${title}`);
    },
    check(name, actual, expected) {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      if (a === e) {
        passed++;
        console.log(`   ok  ${name}`);
      } else {
        failures++;
        console.error(`  FAIL  ${name}\n        expected: ${e}\n        actual:   ${a}`);
      }
    },
    done() {
      console.log(`--- ${suiteName}: ${passed} passed, ${failures} failed`);
      if (failures > 0) process.exit(1);
    },
  };
}
