#!/usr/bin/env node

import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  inventoryComputerUseSources,
  validateComputerUseTree,
} from "./dist-layout.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const sourceInventory = await inventoryComputerUseSources(repoRoot);
  const result = await validateComputerUseTree(
    join(repoRoot, "dist", "computer-use"),
    sourceInventory,
  );
  console.info(
    `verify-dist: PASS (${result.inventory.fileCount} files, ${result.inventory.sha256})`,
  );
} catch (error) {
  console.error(
    `verify-dist: FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
