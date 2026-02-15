# tin Phase 0 Research

This document executes Phase 0 from `PRD.md`:

- Deeply research `qmd-reference-repo`
- Deeply research `openclaw-reference-repo` (with focus on hybrid search)
- Summarize options and give recommendations for architecture, dependencies, API format, storage, and tests

## Decision update (post-research)

After Phase 0, we locked a practical dependency constraint:

- Prefer pure-Node dependencies.
- Avoid native addon compilation.
- Use built-in `node:sqlite` instead of `better-sqlite3`.

## Scope and inputs

Primary artifacts reviewed:

- `qmd-reference-repo/README.md`
- `qmd-reference-repo/src/store.ts`
- `qmd-reference-repo/src/qmd.ts`
- `qmd-reference-repo/src/store.test.ts`
- `qmd-reference-repo/src/cli.test.ts`
- `openclaw-reference-repo/src/memory/hybrid.ts`
- `openclaw-reference-repo/src/memory/manager.ts`
- `openclaw-reference-repo/src/memory/manager-search.ts`
- `openclaw-reference-repo/src/memory/qmd-manager.ts`
- `openclaw-reference-repo/src/memory/backend-config.ts`
- `openclaw-reference-repo/docs/concepts/memory.md`
- `openclaw-reference-repo/docs/cli/memory.md`
- `openclaw-reference-repo/src/cli/memory-cli.ts`
- Runtime behavior check: `node openclaw-reference-repo/openclaw.mjs memory search --help`

## Findings from qmd

1. Storage and indexing architecture:
- Uses SQLite as the canonical index (`documents`, `content`, `documents_fts`, `content_vectors`, `vectors_vec`, `llm_cache`).
- FTS5 is synchronized with triggers from the document table.
- Vectors are stored in sqlite-vec virtual table plus metadata table.
- Incremental indexing is hash-based; changed content updates document/hash relationships.

2. Retrieval architecture:
- `search`: BM25 over FTS5 with normalized score.
- `vsearch`: vector search with two-step query (no joins in vector table query).
- `query`: hybrid pipeline with query expansion, routing by expansion type, RRF fusion, rerank, and position-aware blending.

3. Operational architecture:
- Single store module centralizes schema + retrieval + fusion logic.
- CLI command layer handles formatting, progress, and orchestration.
- Broad feature set adds complexity (MCP, local models, expansion, reranking, daemon mode).

4. Testing strategy:
- Large unit test suite for store internals and ranking math.
- CLI integration tests that spawn real commands against temp fixtures.
- Explicit tests for schema behavior, fusion behavior, and performance-sensitive paths.

## Findings from OpenClaw memory search

1. Hybrid implementation (builtin backend):
- Vector and BM25 are retrieved independently.
- BM25 rank is converted using `1 / (1 + max(0, rank))`.
- Final score is weighted linear fusion: `vectorWeight * vectorScore + textWeight * textScore`.
- Results are merged by stable chunk ID and sorted by fused score.

2. Fallback behavior:
- If vector is unavailable, keyword side can still serve results.
- If FTS is unavailable, vector-only continues (no hard failure).
- QMD backend falls back to builtin backend when subprocess/search parsing fails.

3. Config and operational surface:
- Clear typed config with defaults and normalization.
- Explicit controls for cadence/timeouts/limits/scope.
- CLI supports machine-readable output and diagnostics/probing.

4. CLI UX reference point:
- `openclaw memory search --help` shows a minimal practical surface:
  - `--json`, `--max-results`, `--min-score`, `--agent`

## Decision options and recommendation

### 1) Architecture

Options:

- Option A: one file-per-command logic, light shared utilities.
- Option B: layered architecture (CLI layer, domain services, storage adapters, provider adapters).
- Option C: all logic in a single store module with thin CLI wrappers (qmd-like).

Recommendation:

- Pick Option B.
- Keep command handlers thin and deterministic.
- Isolate ranking/index/provider logic so Phase 2 and Phase 3 do not force CLI rewrites.

Suggested structure:

- `src/cli/` command entrypoints and option parsing
- `src/core/project.ts` project root discovery (`.tin/`)
- `src/core/indexer.ts` file scan/incremental index orchestration
- `src/core/search-bm25.ts`
- `src/core/search-vector.ts`
- `src/core/search-hybrid.ts`
- `src/core/snippets.ts`
- `src/storage/sqlite.ts` schema + queries
- `src/providers/embedding.ts` + `src/providers/rerank.ts`
- `src/config.ts`
- `src/types.ts`

### 2) Dependencies

Options:

- Option A: minimal deps + custom parsing/query logic.
- Option B: pragmatic small deps for CLI, DB, validation, and tests.
- Option C: heavy framework stack.

Recommendation (Option B):

- Runtime:
  - `commander` for CLI
  - built-in `node:sqlite` for local DB and FTS5
  - `zod` for config and API payload validation
  - `fast-glob` for include/exclude scanning
- Dev:
  - `typescript`
  - `vitest`
  - `tsx`

Reasoning:

- Keeps stack stable on Node >=22 (required for `node:sqlite`).
- Avoids Bun coupling.
- Avoids local-model complexity from qmd.
- Avoids native addon install/compile risk.

### 3) API format (embedding + reranking)

Options:

- Option A: provider-specific clients only.
- Option B: OpenAI-compatible first, provider-specific adapters optional.

Recommendation:

- Pick Option B.
- Define a small internal provider interface:
  - `embed(texts: string[]): Promise<number[][]>`
  - `rerank?(query: string, docs: { id: string; text: string }[]): Promise<{ id: string; score: number }[]>`
- Default to OpenAI-compatible embeddings endpoint.
- Reranking optional; if unavailable, hybrid uses fusion-only ranking.

Suggested env shape:

- `TIN_EMBEDDING_API_KEY`
- `TIN_EMBEDDING_BASE_URL` (default OpenAI base)
- `TIN_EMBEDDING_MODEL`
- `TIN_RERANK_API_KEY` (optional)
- `TIN_RERANK_BASE_URL` (optional)
- `TIN_RERANK_MODEL` (optional)

### 4) Storage format

Options:

- Option A: `.tin/index.json` + `.tin/manifest.json` + `.tin/embeddings.bin`
- Option B: single `.tin/index.sqlite` + optional cache files
- Option C: hybrid JSON metadata + SQLite for vectors/fts

Recommendation:

- Pick Option B (single SQLite file) from Phase 1 onward.
- Use tables:
  - `documents` (path, title, hash, mtime, active)
  - `content` (hash, text)
  - `chunks` (doc hash, seq, start_line, end_line, text)
  - `embeddings` (chunk id, model, vector or serialized blob)
  - `fts_chunks` (FTS5 virtual table for chunk text/title/path)
  - `meta` (schema version, provider/model fingerprint, chunking params)

Why:

- Simplifies incremental updates, deletions, and future migrations.
- Avoids phase-to-phase storage migrations.
- Directly supports BM25 + vector + hybrid.

### 5) Hybrid algorithm

Options:

- Option A: weighted linear fusion (OpenClaw builtin style).
- Option B: RRF fusion + optional rerank (qmd style, without expansion).

Recommendation:

- Phase 3 default: Option B without query expansion:
  - retrieve top-k BM25 and vector
  - fuse by RRF
  - optional rerank on fused top-N
- Fallback mode: Option A when reranker unavailable or API budget is constrained.

Why:

- RRF is robust across score-scale mismatch.
- No need to normalize BM25 and cosine aggressively.
- Keeps behavior predictable while still higher quality than pure linear mix.

### 6) Tests

Options:

- Option A: mostly unit tests.
- Option B: unit + command integration + fixture-driven retrieval expectations.

Recommendation:

- Pick Option B.
- Test layers:
  - Unit: path discovery, incremental diffing, snippet extraction, fusion math.
  - Storage integration: schema init, updates, deletes, FTS queries, migrations.
  - CLI integration: spawn `tin` against fixture workspaces (`init/index/search/vsearch/query/status`).
  - Provider contract tests with mocked HTTP responses.

Minimum success criteria per phase:

- Phase 1: `init/index/search/status` deterministic on fixture corpus.
- Phase 2: vector search returns expected conceptual matches on fixture corpus.
- Phase 3: hybrid outperforms BM25-only and vector-only on mixed benchmark queries.

## Concrete defaults for tin v1

1. Runtime: Node 22+, ESM, TypeScript.
2. Local project model: `.tin/` marker in repo root, discovery by upward walk.
3. Index file: `.tin/index.sqlite`.
4. File types: Markdown + plain text only for v1.
5. Chunking: heading-aware when possible; fallback fixed-size by characters/tokens.
6. Incremental strategy: mtime + content hash; delete tombstoned files.
7. Search defaults:
- `search`: BM25, fast path.
- `vsearch`: vector-only, requires embedding config.
- `query`: BM25 + vector via RRF; optional rerank if configured.
8. Output modes:
- default human
- `--json` stable schema
- `--files` unique relative paths

## Risks and mitigations

1. `node:sqlite` API is experimental in current Node releases:
- Mitigation: isolate DB calls behind `src/storage/` adapter and pin/test Node version in CI.

2. Vector retrieval may rely on brute-force cosine for v1 (no sqlite-vec):
- Mitigation: acceptable at personal scale; keep retrieval adapter swappable for future acceleration.

3. API cost and latency for embeddings/rerank:
- Mitigation: batch embeddings, cache by content hash + model fingerprint, rerank only top-N.

4. Scope creep from qmd features:
- Mitigation: explicitly defer query expansion, MCP, daemons, file watchers.

## Open questions carried forward

1. None blocking for Phase 1 scaffolding.
