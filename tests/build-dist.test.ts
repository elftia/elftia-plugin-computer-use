import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { buildDist } from "../scripts/build-dist.mjs";

const sourceRepo = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const tempRoots: string[] = [];
const redirects: Array<{ parent: string; displaced: string }> = [];

function tempRoot(prefix: string): string {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function fixtureRepo(): string {
  const root = tempRoot("computer-use-producer-");
  cpSync(
    path.join(sourceRepo, "elftia-plugin.json"),
    path.join(root, "elftia-plugin.json"),
  );
  cpSync(path.join(sourceRepo, "skills"), path.join(root, "skills"), {
    recursive: true,
  });
  mkdirSync(path.join(root, ".computer-use"), { recursive: true });
  writeFileSync(
    path.join(root, ".computer-use", "doctor.png"),
    "not shipped",
    "utf8",
  );
  mkdirSync(path.join(root, "tests"), { recursive: true });
  writeFileSync(
    path.join(root, "tests", "source-only.test.ts"),
    "not shipped",
    "utf8",
  );
  return root;
}

function redirectParent(transaction: any, outside: string): void {
  const parent = transaction.location.parent as string;
  const displaced = `${parent}-displaced`;
  renameSync(parent, displaced);
  symlinkSync(
    outside,
    parent,
    process.platform === "win32" ? "junction" : "dir",
  );
  redirects.push({ parent, displaced });
}

function restoreRedirect(record: { parent: string; displaced: string }): void {
  if (existsSync(record.parent) && lstatSync(record.parent).isSymbolicLink()) {
    unlinkSync(record.parent);
  }
  if (existsSync(record.displaced) && !existsSync(record.parent)) {
    renameSync(record.displaced, record.parent);
  }
}

afterEach(() => {
  for (const redirect of redirects.splice(0).reverse())
    restoreRedirect(redirect);
  for (const root of tempRoots.splice(0).reverse()) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("computer-use dist producer", () => {
  it("publishes only the manifest and self-contained skill runtime", async () => {
    const repoRoot = fixtureRepo();
    const result = await buildDist({ repoRoot });
    const target = path.join(repoRoot, "dist", "computer-use");

    expect(result.target).toBe(target);
    expect(readdirSync(target).sort()).toEqual([
      "elftia-plugin.json",
      "skills",
    ]);
    expect(
      existsSync(
        path.join(target, "skills", "computer-use", "scripts", "cli.js"),
      ),
    ).toBe(true);
    expect(existsSync(path.join(target, ".computer-use"))).toBe(false);
    expect(existsSync(path.join(target, "tests"))).toBe(false);
    expect(existsSync(path.join(target, "node_modules"))).toBe(false);
  });

  it("replaces a stale dist tree and leaves no transaction residue", async () => {
    const repoRoot = fixtureRepo();
    await buildDist({ repoRoot });
    const target = path.join(repoRoot, "dist", "computer-use");
    writeFileSync(path.join(target, "stale.txt"), "stale", "utf8");

    await buildDist({ repoRoot });

    expect(existsSync(path.join(target, "stale.txt"))).toBe(false);
    expect(readdirSync(path.join(repoRoot, "dist")).sort()).toEqual([
      "computer-use",
    ]);
  });

  it("refuses a redirected parent before the forward install and never touches outside bytes", async () => {
    const repoRoot = fixtureRepo();
    const outside = tempRoot("computer-use-outside-");
    writeFileSync(path.join(outside, "sentinel.txt"), "outside-stays", "utf8");

    await expect(
      buildDist({
        repoRoot,
        fault: async (point: string, transaction: any) => {
          if (point === "before-install") redirectParent(transaction, outside);
        },
      }),
    ).rejects.toThrow(/physical identity changed|ordinary directory/u);

    expect(readFileSync(path.join(outside, "sentinel.txt"), "utf8")).toBe(
      "outside-stays",
    );
    expect(readdirSync(outside).sort()).toEqual(["sentinel.txt"]);
  });

  it("preserves recovery trees when the parent is redirected during rollback", async () => {
    const repoRoot = fixtureRepo();
    await buildDist({ repoRoot });
    const outside = tempRoot("computer-use-outside-");
    writeFileSync(path.join(outside, "sentinel.txt"), "outside-stays", "utf8");

    await expect(
      buildDist({
        repoRoot,
        fault: async (point: string, transaction: any) => {
          if (point === "before-install")
            throw new Error("inject forward failure");
          if (point === "before-rollback") redirectParent(transaction, outside);
        },
      }),
    ).rejects.toThrow(/rollback failures.*recovery paths/u);

    expect(readFileSync(path.join(outside, "sentinel.txt"), "utf8")).toBe(
      "outside-stays",
    );
    expect(readdirSync(outside).sort()).toEqual(["sentinel.txt"]);
  });

  it("reports committed cleanup failure without deleting installed or outside bytes", async () => {
    const repoRoot = fixtureRepo();
    await buildDist({ repoRoot });
    const manifestPath = path.join(repoRoot, "elftia-plugin.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    writeFileSync(
      manifestPath,
      JSON.stringify({ ...manifest, version: "0.8.1" }),
      "utf8",
    );
    const outside = tempRoot("computer-use-outside-");
    writeFileSync(path.join(outside, "sentinel.txt"), "outside-stays", "utf8");

    const error = await buildDist({
      repoRoot,
      fault: async (point: string, transaction: any) => {
        if (point === "before-cleanup") redirectParent(transaction, outside);
      },
    }).catch((caught: unknown) => caught as Error & { committed?: boolean });

    expect(error).toBeInstanceOf(Error);
    expect(error.committed).toBe(true);
    expect(error.message).toContain("residue=");
    expect(readFileSync(path.join(outside, "sentinel.txt"), "utf8")).toBe(
      "outside-stays",
    );
    expect(readdirSync(outside).sort()).toEqual(["sentinel.txt"]);

    const redirect = redirects.at(-1)!;
    restoreRedirect(redirect);
    redirects.pop();
    const installed = JSON.parse(
      readFileSync(
        path.join(repoRoot, "dist", "computer-use", "elftia-plugin.json"),
        "utf8",
      ),
    );
    expect(installed.version).toBe("0.8.1");
    expect(
      readdirSync(path.join(repoRoot, "dist")).some((name) =>
        name.startsWith(".computer-use-backup-"),
      ),
    ).toBe(true);
  });
});
