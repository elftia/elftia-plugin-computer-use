import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
} from "node:fs/promises";
import path from "node:path";

const RUNTIME_ROOT_ENTRIES = Object.freeze(["elftia-plugin.json", "skills"]);
const REQUIRED_RUNTIME_FILES = Object.freeze([
  "elftia-plugin.json",
  "skills/computer-use/SKILL.md",
  "skills/computer-use/package.json",
  "skills/computer-use/scripts/cli.js",
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isContainedPath(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function compareEntries(left, right) {
  return Buffer.compare(
    Buffer.from(left.path, "utf8"),
    Buffer.from(right.path, "utf8"),
  );
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function inventoryDigest(entries) {
  const rows = entries
    .map((entry) => `${entry.path}\t${entry.sha256}\n`)
    .join("");
  return sha256(Buffer.from(rows, "utf8"));
}

async function assertOrdinaryDirectory(directory, label) {
  const state = await lstat(directory);
  assert(
    state.isDirectory() && !state.isSymbolicLink(),
    `${label} must be an ordinary directory without a symlink, junction, or reparse escape`,
  );
  return realpath(directory);
}

async function visitTree(lexicalRoot, realRoot, directory, entries) {
  const children = await readdir(directory, { withFileTypes: true });
  children.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  for (const child of children) {
    const absolutePath = path.join(directory, child.name);
    const relativePath = path
      .relative(lexicalRoot, absolutePath)
      .replaceAll("\\", "/");
    const state = await lstat(absolutePath);
    assert(
      !state.isSymbolicLink(),
      `symlink or junction is forbidden: ${relativePath}`,
    );
    const physicalPath = await realpath(absolutePath);
    assert(
      isContainedPath(realRoot, physicalPath),
      `reparse escape is forbidden: ${relativePath}`,
    );
    if (state.isDirectory()) {
      await visitTree(lexicalRoot, realRoot, absolutePath, entries);
    } else if (state.isFile()) {
      const bytes = await readFile(absolutePath);
      entries.push({
        path: relativePath,
        size: bytes.length,
        sha256: sha256(bytes),
      });
    } else {
      throw new Error(`special file is forbidden: ${relativePath}`);
    }
  }
}

export async function inventoryRegularTree(treeRoot, label = "plugin tree") {
  const lexicalRoot = path.resolve(treeRoot);
  const realRoot = await assertOrdinaryDirectory(lexicalRoot, label);
  const entries = [];
  await visitTree(lexicalRoot, realRoot, lexicalRoot, entries);
  entries.sort(compareEntries);
  return {
    root: lexicalRoot,
    realRoot,
    fileCount: entries.length,
    sha256: inventoryDigest(entries),
    entries,
  };
}

export function inventoriesEqual(left, right) {
  if (left.fileCount !== right.fileCount || left.sha256 !== right.sha256)
    return false;
  return left.entries.every((entry, index) => {
    const other = right.entries[index];
    return (
      other !== undefined &&
      entry.path === other.path &&
      entry.size === other.size &&
      entry.sha256 === other.sha256
    );
  });
}

export async function inventoryComputerUseSources(repoRootInput) {
  const repoRoot = path.resolve(repoRootInput);
  const realRepoRoot = await assertOrdinaryDirectory(
    repoRoot,
    "producer repository",
  );
  const entries = [];
  for (const rootEntry of RUNTIME_ROOT_ENTRIES) {
    const sourcePath = path.join(repoRoot, rootEntry);
    const state = await lstat(sourcePath);
    assert(
      !state.isSymbolicLink(),
      `runtime source is a symlink or junction: ${rootEntry}`,
    );
    const physicalPath = await realpath(sourcePath);
    assert(
      isContainedPath(realRepoRoot, physicalPath),
      `runtime source escapes repository: ${rootEntry}`,
    );
    if (state.isDirectory()) {
      await visitTree(repoRoot, realRepoRoot, sourcePath, entries);
    } else if (state.isFile()) {
      const bytes = await readFile(sourcePath);
      entries.push({
        path: rootEntry,
        size: bytes.length,
        sha256: sha256(bytes),
      });
    } else {
      throw new Error(
        `runtime source is not a regular file or directory: ${rootEntry}`,
      );
    }
  }
  entries.sort(compareEntries);
  return {
    root: repoRoot,
    realRoot: realRepoRoot,
    fileCount: entries.length,
    sha256: inventoryDigest(entries),
    entries,
  };
}

export async function copyInventory(
  sourceRootInput,
  inventory,
  destinationRootInput,
) {
  const sourceRoot = path.resolve(sourceRootInput);
  const destinationRoot = path.resolve(destinationRootInput);
  await mkdir(destinationRoot);
  for (const entry of inventory.entries) {
    const sourcePath = path.resolve(sourceRoot, ...entry.path.split("/"));
    const destinationPath = path.resolve(
      destinationRoot,
      ...entry.path.split("/"),
    );
    assert(
      isContainedPath(sourceRoot, sourcePath),
      `copy source escapes repository: ${entry.path}`,
    );
    assert(
      isContainedPath(destinationRoot, destinationPath),
      `copy destination escapes stage: ${entry.path}`,
    );
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  }
}

export async function validateComputerUseTree(
  treeRoot,
  expectedInventory = null,
) {
  const rootNames = (await readdir(treeRoot)).sort();
  assert(
    JSON.stringify(rootNames) ===
      JSON.stringify([...RUNTIME_ROOT_ENTRIES].sort()),
    `install tree root must contain only ${RUNTIME_ROOT_ENTRIES.join(" and ")}`,
  );

  const manifest = JSON.parse(
    await readFile(path.join(treeRoot, "elftia-plugin.json"), "utf8"),
  );
  assert(
    manifest.name === "computer-use",
    "manifest name must be computer-use",
  );
  assert(manifest.kind === "agent", "manifest kind must be agent");
  assert(
    typeof manifest.version === "string" && manifest.version.length > 0,
    "manifest version missing",
  );
  const skills = manifest.contributes?.agent?.skills;
  assert(
    Array.isArray(skills) && skills.length === 1,
    "manifest must contribute exactly one skill",
  );
  assert(
    skills[0]?.path === "skills/computer-use",
    "manifest skill path must be skills/computer-use",
  );

  const inventory = await inventoryRegularTree(
    treeRoot,
    "computer-use install tree",
  );
  for (const requiredPath of REQUIRED_RUNTIME_FILES) {
    assert(
      inventory.entries.some((entry) => entry.path === requiredPath),
      `required runtime file missing: ${requiredPath}`,
    );
  }
  const nodeModulesEntry = inventory.entries.find((entry) =>
    entry.path.split("/").includes("node_modules"),
  );
  assert(
    nodeModulesEntry === undefined,
    `node_modules is forbidden in dist: ${nodeModulesEntry?.path}`,
  );
  if (expectedInventory !== null) {
    assert(
      inventoriesEqual(inventory, expectedInventory),
      "dist inventory differs from runtime sources",
    );
  }
  return { manifest, inventory };
}
