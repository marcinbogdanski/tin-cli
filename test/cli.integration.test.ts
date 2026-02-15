import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

type CmdResult = {
  code: number;
  stdout: string;
  stderr: string;
};

function runTin(args: string[], cwd: string): CmdResult {
  const cliPath = resolve(process.cwd(), "dist/src/cli/main.js");
  const proc = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8"
  });

  return {
    code: proc.status ?? 1,
    stdout: proc.stdout ?? "",
    stderr: proc.stderr ?? ""
  };
}

describe("tin CLI integration", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "tin-cli-test-"));
    mkdirSync(join(workspace, "docs"), { recursive: true });
    writeFileSync(join(workspace, "docs", "a.md"), "# Alpha\n\nThe alpha project is active.\n");
    writeFileSync(join(workspace, "docs", "b.txt"), "Beta release notes and deployment plan.\n");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("runs init/index/search/status with json and files outputs", () => {
    const init = runTin(["init"], workspace);
    assert.equal(init.code, 0);

    const cfg = JSON.parse(readFileSync(join(workspace, ".tin", "config.json"), "utf8")) as {
      include: string[];
      exclude: string[];
    };
    assert.ok(cfg.include.includes("**/*.md"));
    assert.ok(cfg.include.includes("**/*.txt"));

    const index1 = runTin(["index", "--json"], workspace);
    assert.equal(index1.code, 0, index1.stderr);
    const stats1 = JSON.parse(index1.stdout) as {
      scanned: number;
      added: number;
      updated: number;
      skipped: number;
      removed: number;
    };
    assert.equal(stats1.added, 2);
    assert.equal(stats1.updated, 0);
    assert.equal(stats1.removed, 0);

    const searchJson = runTin(["search", "alpha", "--json"], workspace);
    assert.equal(searchJson.code, 0, searchJson.stderr);
    const results = JSON.parse(searchJson.stdout) as Array<{ path: string; score: number; line: number }>;
    assert.ok(results.length >= 1);
    assert.equal(results[0]?.path, "docs/a.md");
    assert.ok((results[0]?.score ?? 0) > 0);
    assert.ok((results[0]?.line ?? 0) >= 1);

    const searchFiles = runTin(["search", "alpha", "--files"], workspace);
    assert.equal(searchFiles.code, 0, searchFiles.stderr);
    const paths = searchFiles.stdout.trim().split(/\n/).filter(Boolean);
    assert.deepEqual(paths, ["docs/a.md"]);

    const status = runTin(["status", "--json"], workspace);
    assert.equal(status.code, 0, status.stderr);
    const statusJson = JSON.parse(status.stdout) as { indexedFiles: number; indexedChunks: number; rootPath: string };
    assert.equal(statusJson.indexedFiles, 2);
    assert.equal(statusJson.rootPath, workspace);
    assert.ok(statusJson.indexedChunks >= 2);
  });

  it("indexes incrementally and removes deleted files", () => {
    assert.equal(runTin(["init"], workspace).code, 0);
    const first = JSON.parse(runTin(["index", "--json"], workspace).stdout) as { added: number };
    assert.equal(first.added, 2);

    const second = JSON.parse(runTin(["index", "--json"], workspace).stdout) as {
      scanned: number;
      skipped: number;
    };
    assert.equal(second.scanned, 2);
    assert.equal(second.skipped, 2);

    writeFileSync(join(workspace, "docs", "a.md"), "# Alpha\n\nThe alpha project is archived.\n");
    rmSync(join(workspace, "docs", "b.txt"));

    const third = JSON.parse(runTin(["index", "--json"], workspace).stdout) as {
      updated: number;
      removed: number;
    };
    assert.equal(third.updated, 1);
    assert.equal(third.removed, 1);
  });

  it("discovers project root from nested directories", () => {
    assert.equal(runTin(["init"], workspace).code, 0);

    const nested = join(workspace, "docs", "nested");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "deep.md"), "Deep alpha notes\n");

    const index = runTin(["index", "--json"], nested);
    assert.equal(index.code, 0, index.stderr);

    const search = runTin(["search", "deep", "--json"], nested);
    assert.equal(search.code, 0, search.stderr);
    const results = JSON.parse(search.stdout) as Array<{ path: string }>;
    assert.ok(results.some((r) => r.path === "docs/nested/deep.md"));
  });

  it("fails outside a tin project", () => {
    const res = runTin(["status"], workspace);
    assert.notEqual(res.code, 0);
    assert.match(res.stderr, /No tin project found/);
  });
});
