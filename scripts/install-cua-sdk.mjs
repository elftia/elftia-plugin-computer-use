#!/usr/bin/env node

// Installs the Cua Driver SDK runtime (@trycua/cua-driver + platform native
// package) into the plugin's prebuilds channel so `cua` / `cua-serve` work
// from the installed skill. The vendored CLI resolves the SDK from
// prebuilds/<platform>-<arch>/node_modules (see its defaultLoadCuaDriver).
// npm runs only on the build machine; end users receive the tree as-is.
// Mirrors install:mado-native: heavy binaries stay out of git.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SDK_VERSION = '0.30.4';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const platformTarget = process.env.ELFTIA_CUA_TARGET ?? `${process.platform}-${process.arch}`;
if (!/^(?:win32|linux|darwin)-(?:x64|arm64)$/.test(platformTarget)) {
  throw new Error(`Unsupported Cua SDK target: ${platformTarget}`);
}
const [targetOs, targetArch] = platformTarget.split('-');
const targetDir = join(repoRoot, 'prebuilds', platformTarget);
const targetNodeModules = join(targetDir, 'node_modules');
const marker = join(targetNodeModules, '@trycua', 'cua-driver', 'package.json');

const requested = process.argv[2];
const version = requested ? requested.replace(/^@?/, '') : SDK_VERSION;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Usage: npm run install:cua-sdk -- [${SDK_VERSION}]`);
  process.exit(2);
}

function installedVersion() {
  try {
    return JSON.parse(readFileSync(marker, 'utf8')).version;
  } catch {
    return undefined;
  }
}

if (installedVersion() === version) {
  console.info(`install:cua-sdk: already at ${version}`);
  process.exit(0);
}

console.info(`install:cua-sdk: installing @trycua/cua-driver@${version} into ${targetNodeModules}`);
const npmCli = process.env.npm_execpath ?? 'npm';
const result = spawnSync(
  process.execPath,
  [
    npmCli,
    'install',
    `@trycua/cua-driver@${version}`,
    '--prefix', targetDir,
    '--no-save',
    '--no-package-lock',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    `--os=${targetOs}`,
    `--cpu=${targetArch}`,
  ],
  { stdio: 'inherit', shell: false },
);
if (result.status !== 0) {
  console.error('install:cua-sdk: FAIL (npm install)');
  process.exit(1);
}

if (!existsSync(marker)) {
  console.error('install:cua-sdk: FAIL (SDK package.json missing after install)');
  process.exit(1);
}
// The native package name carries a toolchain suffix (win32: -msvc,
// linux: -gnu), so discover it rather than recomputing the spelling.
const atCuaDir = join(targetNodeModules, '@trycua');
const nativeEntry = readdirSync(atCuaDir).find(
  (entry) => entry.startsWith('cua-driver-') && statSync(join(atCuaDir, entry)).isDirectory(),
);
if (nativeEntry === undefined) {
  console.error('install:cua-sdk: FAIL (no @trycua/cua-driver-* native package installed)');
  process.exit(1);
}
const nativeDir = join(atCuaDir, nativeEntry);
const nativePayload =
  targetOs === 'win32' ? ['cua_driver_sdk.dll'] : ['libcua_driver_sdk.so'];
for (const file of [...nativePayload, 'cua_driver_node_runtime.node']) {
  const path = join(nativeDir, file);
  if (!statSync(path).isFile()) {
    console.error(`install:cua-sdk: FAIL (native payload missing: ${nativeEntry}/${file})`);
    process.exit(1);
  }
}
console.info(`install:cua-sdk: PASS (${version} -> prebuilds/${platformTarget})`);
