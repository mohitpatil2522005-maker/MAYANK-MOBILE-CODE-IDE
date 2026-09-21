/**
 * Tiny assertion harness for the pure-logic test suites.
 * Each suite: const t = harness('suite-name'); t.check(...); t.done();
 */
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
