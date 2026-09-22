/**
 * Builds and runs the golden-session test.
 *
 * Why bundle: tsx's CLI re-spawns node with only its own loader flags, so
 * process-level module hooks cannot intercept the native-only imports
 * (react-native, expo-file-system) that the real agent-store closure pulls
 * in. esbuild bundles the test + real app code with those specifiers
 * aliased to Node-safe stubs; tsconfig paths (`@/*`) are honored natively.
 *
 * Run via: node tests/golden/build.mjs
 */
'use strict';
const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { createRequire } = require('node:module');

const root = join(__dirname, '..', '..');
const requireFromRoot = createRequire(join(root, 'package.json'));
const esbuild = requireFromRoot('esbuild');
const out = join(root, '.tmp-golden-test.cjs');

async function main() {
  const entry = process.argv[2]
    ? require('node:path').resolve(process.argv[2])
    : join(__dirname, '..', 'golden.test.ts');
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    tsconfig: join(root, 'tsconfig.json'),
    absWorkingDir: root,
    alias: {
      'react-native': join(__dirname, 'rn-stub.cjs'),
      '@react-native-async-storage/async-storage': join(__dirname, 'async-storage-stub.cjs'),
      'expo-file-system/legacy': join(__dirname, 'fs-stub.cjs'),
      'expo-file-system': join(__dirname, 'fs-stub.cjs'),
      'react-native-keychain': join(__dirname, 'rn-stub.cjs'),
    },
    outfile: out,
    logLevel: 'silent',
  });

  const result = spawnSync(process.execPath, [out], { stdio: 'inherit' });
  rmSync(out, { force: true });
  process.exit(result.status ?? 1);
}

main().catch((err) => {
  rmSync(out, { force: true });
  console.error('GOLDEN BUILD FAILED:', err);
  process.exit(1);
});
