#!/usr/bin/env node

import { closeSync, copyFileSync, mkdirSync, openSync, readSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const names = ['ch_PP-OCRv4_det_mobile.onnx', 'PP-OCRv6_rec_small.onnx'];
const [sidecar, opencv, runtime, modelRoot, ...extra] = process.argv.slice(2);
if (!sidecar || !opencv || !runtime || !modelRoot || extra.length) {
  console.error('Usage: npm run install:mado-native -- <sidecar.exe> <opencv_world4140.dll> <onnxruntime.dll> <model-root>');
  process.exit(2);
}

function regularAbsolute(path, label) {
  if (!isAbsolute(path) || !statSync(path).isFile()) {
    throw new Error(`${label} must be an absolute regular file path`);
  }
  return path;
}

function peFile(path, label) {
  regularAbsolute(path, label);
  const fd = openSync(path, 'r');
  const header = Buffer.alloc(2);
  try {
    if (readSync(fd, header, 0, 2, 0) !== 2 || header.toString('ascii') !== 'MZ') {
      throw new Error(`${label} is not a Windows PE file`);
    }
  } finally {
    closeSync(fd);
  }
  return path;
}

try {
  peFile(sidecar, 'sidecar');
  peFile(opencv, 'OpenCV DLL');
  peFile(runtime, 'ONNX Runtime DLL');
  if (!isAbsolute(modelRoot) || !statSync(modelRoot).isDirectory()) {
    throw new Error('model-root must be an absolute directory');
  }
  const modelFiles = names.map((name) => {
    const path = regularAbsolute(join(modelRoot, 'rapidocr-v3.9.2', name), name);
    if (statSync(path).size === 0) throw new Error(`${name} is empty`);
    return path;
  });

  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const native = join(repoRoot, 'skills', 'computer-use', 'scripts', 'native');
  const models = join(native, 'models', 'rapidocr-v3.9.2');
  mkdirSync(models, { recursive: true });
  copyFileSync(sidecar, join(native, 'elftia-mado-pilot-sidecar.exe'));
  copyFileSync(opencv, join(native, 'opencv_world4140.dll'));
  copyFileSync(runtime, join(native, 'onnxruntime.dll'));
  names.forEach((name, index) => copyFileSync(modelFiles[index], join(models, name)));
  console.log('MadoPilot native bundle installed in the plugin skill tree. Run npm run build to include it in dist.');
} catch (error) {
  console.error(`install:mado-native: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
