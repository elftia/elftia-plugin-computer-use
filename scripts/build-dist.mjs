#!/usr/bin/env node

import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { publishTreeAtomically } from "./atomic-tree-swap.mjs";
import {
  copyInventory,
  inventoryComputerUseSources,
  validateComputerUseTree,
} from "./dist-layout.mjs";

const defaultRepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function buildDist(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const sourceInventory = await inventoryComputerUseSources(repoRoot);
  return publishTreeAtomically({
    repoRoot,
    targetRelative: "dist/computer-use",
    expectedInventory: sourceInventory,
    populateStage: (stage) => copyInventory(repoRoot, sourceInventory, stage),
    validateTree: validateComputerUseTree,
    fault: options.fault,
  });
}

const invokedPath =
  process.argv[1] === undefined ? null : pathToFileURL(process.argv[1]).href;
if (invokedPath === import.meta.url) {
  try {
    const result = await buildDist();
    console.info(
      `build-dist: PASS (${result.inventory.fileCount} files, ${result.inventory.sha256}) -> ${result.target}`,
    );
  } catch (error) {
    console.error(
      `build-dist: FAIL: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
