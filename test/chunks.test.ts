import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunkByLines } from "../src/core/chunks.js";

describe("chunkByLines", () => {
  it("creates at least one chunk for non-empty text", () => {
    const chunks = chunkByLines("line1\nline2\nline3");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]?.startLine, 1);
    assert.equal(chunks[0]?.endLine, 3);
  });

  it("splits long files with overlap", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line-${i + 1}`).join("\n");
    const chunks = chunkByLines(lines, 50, 10);
    assert.ok(chunks.length > 1);
    assert.equal(chunks[0]?.startLine, 1);
    assert.ok((chunks[1]?.startLine ?? 0) <= 50);
  });
});
