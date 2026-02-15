import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunkByChars, normalizeLineEndings } from "../src/core/chunks.js";

describe("chunkByChars", () => {
  it("creates at least one chunk for non-empty text", () => {
    const chunks = chunkByChars("line1\nline2\nline3");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]?.startLine, 1);
    assert.equal(chunks[0]?.endLine, 3);
  });

  it("splits long content with overlap", () => {
    const text = "x".repeat(3000);
    const chunks = chunkByChars(text, 1000, 100);
    assert.ok(chunks.length > 1);
    assert.equal(chunks[0]?.startLine, 1);
    assert.equal(chunks[1]?.startLine, 1);
  });

  it("normalizes windows line endings before chunking", () => {
    const raw = "a\r\nb\r\nc\r\nd";
    const chunks = chunkByChars(raw, 100, 0);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]?.text, "a\nb\nc\nd");
  });
});

describe("normalizeLineEndings", () => {
  it("converts CRLF and CR to LF", () => {
    const normalized = normalizeLineEndings("a\r\nb\rc\n");
    assert.equal(normalized, "a\nb\nc\n");
  });
});
