#!/usr/bin/env node

// Installs the Cua Driver SDK runtime (@trycua/cua-driver + platform native
// package) into the vendored CLI tree so `cua` / `cua-serve` work from the
// installed skill. npm runs only on the build machine; end users receive the
// tree as-is. Mirrors install:mado-native: heavy binaries stay out of git.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SDK_VERSION = '0.30.4';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptsDir = join(repoRoot, 'skills', 'computer-use', 'scripts');
const marker = join(scriptsDir, 'node_modules', '@trycua', 'cua-driver', 'package.json');

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

console.info(`install:cua-sdk: installing @trycua/cua-driver@${version} into ${scriptsDir}`);
const npmCli = process.env.npm_execpath ?? 'npm';
const result = spawnSync(
  process.execPath,
  [
    npmCli,
    'install',
    `@trycua/cua-driver@${version}`,
    '--prefix', scriptsDir,
    '--no-save',
    '--no-package-lock',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
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
const native = join(
  scriptsDir, 'node_modules', '@trycua',
  `cua-driver-${process.platform}-${process.arch === 'x64' ? 'x64' : process.arch}-msvc`,
);
if (process.platform === 'win32' && !statSync(join(native, 'cua_driver_sdk.dll')).isFile()) {
  console.error(`install:cua-sdk: FAIL (native package missing under ${native})`);
  process.exit(1);
}
console.info(`install:cua-sdk: PASS (${version})`);
