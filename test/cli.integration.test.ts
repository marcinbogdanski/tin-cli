import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

type CmdResult = {
  code: number;
  stdout: string;
  stderr: string;
};

function runTin(args: string[], cwd: string, env?: NodeJS.ProcessEnv): CmdResult {
  const cliPath = resolve(process.cwd(), "dist/src/cli/main.js");
  const proc = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env
    }
  });

  return {
    code: proc.status ?? 1,
    stdout: proc.stdout ?? "",
    stderr: proc.stderr ?? ""
  };
}

function runTinAsync(args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<CmdResult> {
  return new Promise((resolvePromise) => {
    const cliPath = resolve(process.cwd(), "dist/src/cli/main.js");
    const proc = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      env: {
        ...process.env,
        ...env
      }
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    proc.on("close", (code) => {
      resolvePromise({
        code: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

function buildVector(text: string): number[] {
  const lowered = text.toLowerCase();
  return [
    lowered.includes("alpha") ? 1 : 0,
    lowered.includes("beta") ? 1 : 0,
    lowered.includes("deployment") ? 1 : 0,
    lowered.length > 40 ? 0.5 : 0
  ];
}

async function withMockEmbeddingServer(fn: (env: NodeJS.ProcessEnv) => Promise<void>): Promise<void> {
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || (req.url !== "/embeddings" && req.url !== "/rerank")) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }

    const bodyChunks: Buffer[] = [];
    for await (const chunk of req) {
      bodyChunks.push(Buffer.from(chunk));
    }

    if (req.url === "/embeddings") {
      const payload = JSON.parse(Buffer.concat(bodyChunks).toString("utf8")) as {
        input: string | string[];
      };

      const inputs = Array.isArray(payload.input) ? payload.input : [payload.input];
      const data = inputs.map((text, index) => ({
        index,
        embedding: buildVector(text)
      }));

      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data }));
      return;
    }

    const payload = JSON.parse(Buffer.concat(bodyChunks).toString("utf8")) as {
      query: string;
      documents: string[];
    };
    const query = (payload.query || "").toLowerCase();
    const docs = Array.isArray(payload.documents) ? payload.documents : [];
    const results = docs.map((doc, index) => ({
      index,
      relevance_score: doc.toLowerCase().includes(query) ? 1 : 0.2
    }));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ data: results }));
  });

  await new Promise<void>((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });

  const addr = server.address();
  if (!addr || typeof addr === "string") {
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    throw new Error("failed to bind mock embedding server");
  }

  const env: NodeJS.ProcessEnv = {
    TIN_EMBEDDING_API_KEY: "test-key",
    TIN_EMBEDDING_BASE_URL: `http://127.0.0.1:${addr.port}`,
    TIN_EMBEDDING_MODEL: "mock-embed-v1",
    TIN_RERANK_API_KEY: "test-rerank-key",
    TIN_RERANK_BASE_URL: `http://127.0.0.1:${addr.port}`,
    TIN_RERANK_MODEL: "mock-rerank-v1"
  };

  try {
    await fn(env);
  } finally {
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  }
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

  it("prints status with embedding config sources", () => {
    assert.equal(runTin(["init"], workspace).code, 0);
    assert.equal(runTin(["index"], workspace).code, 0);

    const res = runTin(["status"], workspace, {
      TIN_EMBEDDING_PROVIDER: "openai",
      TIN_EMBEDDING_BASE_URL: "https://example.invalid/v1/",
      TIN_EMBEDDING_MODEL: "mock-embed-v2",
      TIN_EMBEDDING_API_KEY: "sk-test-abcdef"
    });

    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /Project path: /);
    assert.match(res.stdout, /Tin path: /);
    assert.match(res.stdout, /Index path: /);
    assert.match(res.stdout, /Indexed files: 2/);
    assert.match(res.stdout, /Indexed chunks: /);
    assert.match(res.stdout, /Indexed time: /);
    assert.match(res.stdout, /Embedding provider: openai \(env var: TIN_EMBEDDING_PROVIDER\)/);
    assert.match(
      res.stdout,
      /Embedding API URL: https:\/\/example\.invalid\/v1 \(env var: TIN_EMBEDDING_BASE_URL\)/
    );
    assert.match(res.stdout, /Embedding model name: mock-embed-v2 \(env var: TIN_EMBEDDING_MODEL\)/);
    assert.match(res.stdout, /Embedding API key: sk-tes\.\.\. \(env var: TIN_EMBEDDING_API_KEY\)/);
    assert.match(res.stdout, /Embedded chunks: 0 \/ /);
  });

  it("embeds chunks and supports vsearch with configured API", async () => {
    await withMockEmbeddingServer(async (env) => {
      assert.equal((await runTinAsync(["init"], workspace, env)).code, 0);

      const index = await runTinAsync(["index", "--embed", "--json"], workspace, env);
      assert.equal(index.code, 0, index.stderr);
      const stats = JSON.parse(index.stdout) as { embedded: number; embeddingModel: string };
      assert.ok(stats.embedded >= 2);
      assert.equal(stats.embeddingModel, "mock-embed-v1");

      const vsearch = await runTinAsync(["vsearch", "alpha", "--json"], workspace, env);
      assert.equal(vsearch.code, 0, vsearch.stderr);
      const results = JSON.parse(vsearch.stdout) as Array<{ path: string; source: string }>;
      assert.ok(results.length >= 1);
      assert.equal(results[0]?.path, "docs/a.md");
      assert.equal(results[0]?.source, "vector");

      const status = await runTinAsync(["status", "--json"], workspace, env);
      const statusJson = JSON.parse(status.stdout) as { embeddedChunks: number; needsEmbedding: number };
      assert.ok(statusJson.embeddedChunks >= 2);
      assert.equal(statusJson.needsEmbedding, 0);
    });
  });

  it("supports OPENAI_* fallback for openai embedding provider", async () => {
    await withMockEmbeddingServer(async (env) => {
      const fallbackEnv: NodeJS.ProcessEnv = {
        TIN_EMBEDDING_PROVIDER: "openai",
        TIN_EMBEDDING_MODEL: env.TIN_EMBEDDING_MODEL,
        OPENAI_API_KEY: env.TIN_EMBEDDING_API_KEY,
        OPENAI_BASE_URL: env.TIN_EMBEDDING_BASE_URL
      };

      assert.equal((await runTinAsync(["init"], workspace, fallbackEnv)).code, 0);

      const index = await runTinAsync(["index", "--embed", "--json"], workspace, fallbackEnv);
      assert.equal(index.code, 0, index.stderr);
      const stats = JSON.parse(index.stdout) as { embedded: number; embeddingModel: string };
      assert.ok(stats.embedded >= 2);
      assert.equal(stats.embeddingModel, "mock-embed-v1");

      const vsearch = await runTinAsync(["vsearch", "alpha", "--json"], workspace, fallbackEnv);
      assert.equal(vsearch.code, 0, vsearch.stderr);
      const results = JSON.parse(vsearch.stdout) as Array<{ path: string }>;
      assert.ok(results.length >= 1);
      assert.equal(results[0]?.path, "docs/a.md");

      const status = await runTinAsync(["status"], workspace, fallbackEnv);
      assert.equal(status.code, 0, status.stderr);
      assert.match(status.stdout, /Embedding provider: openai \(env var: TIN_EMBEDDING_PROVIDER\)/);
      assert.match(status.stdout, /Embedding API URL: .* \(env var: OPENAI_BASE_URL\)/);
      assert.match(status.stdout, /Embedding API key: test-k\.\.\. \(env var: OPENAI_API_KEY\)/);
    });
  });

  it("fails outside a tin project", () => {
    const res = runTin(["status"], workspace);
    assert.notEqual(res.code, 0);
    assert.match(res.stderr, /No tin project found/);
  });

  it("query falls back to bm25 when embedding config is missing", () => {
    assert.equal(runTin(["init"], workspace).code, 0);
    assert.equal(runTin(["index"], workspace).code, 0);

    const res = runTin(["query", "alpha", "--json"], workspace);
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stderr, /falling back to BM25-only/i);
    const results = JSON.parse(res.stdout) as Array<{ path: string; source: string }>;
    assert.ok(results.length >= 1);
    assert.equal(results[0]?.path, "docs/a.md");
    assert.equal(results[0]?.source, "bm25");
  });

  it("query returns hybrid results and supports rerank", async () => {
    await withMockEmbeddingServer(async (env) => {
      assert.equal((await runTinAsync(["init"], workspace, env)).code, 0);
      assert.equal((await runTinAsync(["index", "--embed"], workspace, env)).code, 0);

      const res = await runTinAsync(["query", "alpha", "--json"], workspace, env);
      assert.equal(res.code, 0, res.stderr);
      const results = JSON.parse(res.stdout) as Array<{ path: string; source: string }>;
      assert.ok(results.length >= 1);
      assert.equal(results[0]?.source, "hybrid");
      assert.equal(results[0]?.path, "docs/a.md");
    });
  });

  it("fails vsearch when embedding config is missing", () => {
    assert.equal(runTin(["init"], workspace).code, 0);
    assert.equal(runTin(["index"], workspace).code, 0);

    const res = runTin(["vsearch", "alpha"], workspace);
    assert.notEqual(res.code, 0);
    assert.match(res.stderr, /Embedding is not configured/);
  });
});
