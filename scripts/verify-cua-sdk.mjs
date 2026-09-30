#!/usr/bin/env node

// Cua Driver SDK distribution checks (Phase 3 of the Cua integration plan).
// Validates the SDK inside a computer-use install tree when present:
//   1. main package and platform native package carry the SAME version;
//   2. the native payload files exist (dll + .node, layout-sensitive);
//   3. the vendored CLI actually loads the native runtime (health call) via
//      the prebuilds channel resolution.
// When the SDK is absent the check reports SKIP (not FAIL) so clean
// contributor checkouts can still pass `verify` — build machines run
// `npm run install:cua-sdk` before building, which makes it mandatory there.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const treeRoot = process.argv[2]
  ? join(repoRoot, process.argv[2])
  : join(repoRoot, 'dist', 'computer-use');
const platformTarget = `${process.platform}-${process.arch}`;
const targetNodeModules = join(treeRoot, 'prebuilds', platformTarget, 'node_modules');
const sdkPackage = join(targetNodeModules, '@trycua', 'cua-driver', 'package.json');
const manifestPath = join(treeRoot, 'elftia-plugin.json');

if (!existsSync(sdkPackage)) {
  console.info('verify-cua-sdk: SKIP (@trycua/cua-driver not installed in prebuilds; run npm run install:cua-sdk on the build machine)');
  process.exit(0);
}

const failures = [];
const sdk = JSON.parse(readFileSync(sdkPackage, 'utf8'));
if (typeof sdk.version !== 'string' || sdk.version === '') {
  failures.push('SDK package.json has no version');
}

// The manifest must declare exactly the prebuilt targets it ships.
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const prebuildsDir = join(treeRoot, 'prebuilds');
const declared = Array.isArray(manifest.supportedPlatforms) ? manifest.supportedPlatforms : [];
if (declared.length === 0) {
  failures.push('manifest.supportedPlatforms is empty while prebuilds/ ships the SDK');
}
for (const target of declared) {
  if (!existsSync(join(prebuildsDir, target, 'node_modules', '@trycua'))) {
    failures.push(`declared supportedPlatform has no SDK under prebuilds: ${target}`);
  }
}

// The native package name carries a toolchain suffix (win32: -msvc,
// linux: -gnu), so discover it rather than recomputing the spelling.
const atCuaDir = join(targetNodeModules, '@trycua');
const nativeEntry = existsSync(atCuaDir)
  ? readdirSync(atCuaDir).find(
      (entry) => entry.startsWith('cua-driver-') && statSync(join(atCuaDir, entry)).isDirectory(),
    )
  : undefined;
if (nativeEntry === undefined) {
  failures.push(`native package missing: @trycua/cua-driver-* under prebuilds/${platformTarget}`);
} else {
  const native = JSON.parse(readFileSync(join(atCuaDir, nativeEntry, 'package.json'), 'utf8'));
  if (native.version !== sdk.version) {
    failures.push(`version drift: main ${sdk.version} vs native ${native.version}`);
  }
  // File layout is load-bearing: @ubjs/node resolves the dll by crate name
  // relative to the .node runtime — they must sit in the same directory.
  const payload =
    process.platform === 'win32'
      ? ['cua_driver_sdk.dll', 'cua_driver_node_runtime.node']
      : ['libcua_driver_sdk.so', 'cua_driver_node_runtime.node'];
  for (const file of payload) {
    const path = join(atCuaDir, nativeEntry, file);
    if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0) {
      failures.push(`native payload missing or empty: ${nativeEntry}/${file}`);
    }
  }
}

// Load check: the vendored CLI must come back healthy from its own tree,
// resolving the SDK through the prebuilds channel (NOT repo node_modules).
if (failures.length === 0) {
  const health = spawnSync(
    process.execPath,
    [join(treeRoot, 'skills', 'computer-use', 'scripts', 'cli.js'), 'cua', '--action', 'health'],
    { encoding: 'utf8', timeout: 60000, shell: false },
  );
  let ok = false;
  try {
    ok = JSON.parse(health.stdout).ok === true;
  } catch {
    ok = false;
  }
  if (!ok) {
    failures.push(`vendored CLI cua health failed (exit=${health.status}): ${(health.stdout ?? health.stderr ?? '').slice(0, 160)}`);
  }
}

if (failures.length > 0) {
  console.error(`verify-cua-sdk: FAIL (${failures.length})`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.info(`verify-cua-sdk: PASS (@trycua/cua-driver ${sdk.version} via prebuilds/${platformTarget}, native loads)`);
