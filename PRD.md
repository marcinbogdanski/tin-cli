# tin — Product Requirements Document

A command-line tool for searching local document collections using keyword and semantic search. Designed for personal knowledge bases (notes, docs, meeting transcripts) and agentic workflows, primarily as an OpenClaw skill.

## Project Status

- Phase 0 (Research): Completed
- Phase 1 (Scaffold + Keyword Search): Completed
- Phase 2 (Semantic Search): Completed
- Phase 3 (Hybrid + Reranking): Completed
- Current stage: Ready to begin Phase 4 implementation
- Research output: `PHASE0_RESEARCH.md`

## Context

- **Author:** Personal project, public GitHub repo.
- **Runtime:** Node.js (aligns with OpenClaw ecosystem, simple distribution via `npm i -g`, easy to hack on).
- **Primary consumer:** OpenClaw agent via a skill definition. Also usable directly from the terminal.
- **Prior art:** [qmd](https://github.com/tobi/qmd) by Tobi Lütke is the closest existing tool. tin is a personal, hackable alternative.

## Differences from qmd

- Stores index inside each project's `.tin/` folder (no global index).
- API-based embedding/rerank providers only (no built-in local models in v1).
- BM25 + vector + hybrid retrieval, no query expansion in v1.
- No MCP server in v1 (CLI-first).

## Concepts

- **Project:** A folder tree of documents, identified by a `.tin/` marker directory at the root.
- **Index:** A searchable representation of project documents stored inside `.tin/`.

## Discovery

When invoked, `tin` walks up from the current directory until it finds `.tin/`. This determines project root and index location. Fail with a clear error if no project is found.

## Commands

### `tin init`

Create a new project in the current directory. Creates `.tin/` and default config.

### `tin index`

Scan project documents and build/update the index. Re-process only changed files and remove deleted files from the index.

### `tin search <query>`

Keyword search (BM25). Fast local retrieval, no embedding API required.

### `tin vsearch <query>`

Vector/semantic search. Finds conceptually related content. Requires embedding API configuration.

### `tin query <query>`

Hybrid search. Combine BM25 and vector retrieval with RRF fusion. Optional reranking can be enabled via API config.

If embeddings are unavailable, degrade to BM25 with a clear warning.

### `tin status`

Show project info: root path, document/chunk counts, index freshness, and embedding coverage.

## Search Results

Each result includes:

- File path (relative to project root)
- Position within file (line or section)
- Relevance score (normalized 0–1)
- Snippet with local context

Output formats:

- Human-readable (default)
- JSON (`--json`)
- File list (`--files`)

## Document Types

Index text-based files in v1:

- Markdown (`.md`)
- Plain text (`.txt`)

Out of scope for v1: PDFs and binary formats.

## Incremental Updates

Indexing should be fast on repeat runs.

- Detect changes with `mtime + content hash`
- Only process new/modified files
- Remove deleted files from index

## Configuration

Minimal by default.

- API keys via env vars
  - `TIN_EMBEDDING_API_KEY`
  - `TIN_EMBEDDING_BASE_URL` (optional)
  - `TIN_EMBEDDING_MODEL`
  - `TIN_RERANK_API_KEY` (optional)
  - `TIN_RERANK_BASE_URL` (optional)
  - `TIN_RERANK_MODEL` (optional)
- Include/exclude globs in `.tin/config.json`

## OpenClaw Integration

tin is designed to be invoked by an OpenClaw agent via a skill. The skill definition should:

- Declare `tin` as required binary (`requires.bins: ["tin"]`)
- Provide install instructions (`kind: "node"`, package name)
- Describe command intent (`search` vs `vsearch` vs `query`)
- Prefer `--json` output for programmatic parsing

A `SKILL.md` will be authored in Phase 4.

## Phase 0 Decisions (Locked)

### Architecture

Use a layered architecture:

- `src/cli/` command handlers
- `src/core/` indexing and retrieval logic
- `src/storage/` SQLite schema + query layer
- `src/providers/` embedding/rerank adapters

### Storage

Use a SQLite-first design from Phase 1:

- `.tin/index.sqlite`
- No JSON index files
- Use built-in `node:sqlite` (no `better-sqlite3` dependency)

### Retrieval

- `search`: BM25
- `vsearch`: vector similarity
- `query`: BM25 + vector with RRF fusion
- Reranker is optional and opt-in

### Provider Model

OpenAI-compatible API interface first, provider-specific adapters optional.

### Dependency Policy

Prefer minimal, pure-Node dependencies. Avoid native addons where practical.

### Test Strategy

- Unit tests for ranking math and incremental logic
- Storage integration tests for schema/query behavior
- CLI integration tests against fixture workspaces
- Mocked provider contract tests

## Tech Stack

- **Language/runtime:** Node.js >= 22, TypeScript, ESM
- **CLI framework:** `commander`
- **Storage/index:** built-in `node:sqlite` with FTS5
- **File scanning:** `fast-glob`
- **Validation:** `zod`
- **Testing:** `vitest` + `tsx`

## Implementation Plan

### Phase 0 — Research (Completed)

Focus points:

- project architecture
- dependencies
- API format
- storage
- testing strategy

Actions:

- [x] Deeply research `qmd-reference-repo`
- [x] Deeply research `openclaw-reference-repo` focusing on hybrid search
- [x] Summarize options and provide recommendations

Output:

- [x] `PHASE0_RESEARCH.md`

### Phase 1 — Scaffold + Keyword Search

- [x] Project setup (`package.json`, TypeScript, ESM, bin entrypoint)
- [x] `tin init` to create `.tin/`
- [x] SQLite schema bootstrap (`.tin/index.sqlite`)
- [x] `tin index` incremental file indexing (mtime + hash)
- [x] BM25 chunk indexing with FTS5
- [x] `tin search <query>` with scoring + snippets
- [x] `tin status` basic index health
- [x] Output formats: human, `--json`, `--files`
- [x] `.tin/config.json` for include/exclude globs

### Phase 2 — Semantic Search

- [x] Embedding provider adapter (OpenAI-compatible)
- [x] Embedding generation during `tin index` (opt-in/auto when configured)
- [x] Vector storage in SQLite (`embeddings` + vector retrieval path)
- [x] `tin vsearch <query>` with cosine similarity
- [x] Chunking policy for long documents (heading-aware + fallback)

### Phase 3 — Hybrid + Reranking

- [x] `tin query <query>` BM25 + vector retrieval
- [x] RRF fusion as default hybrid combiner
- [x] Optional reranking API on fused top-N
- [x] Graceful fallback when reranker or embeddings are unavailable
- [x] Score normalization/reporting to 0–1

### Phase 4 — OpenClaw Skill

- [x] Author `SKILL.md` with frontmatter (name, description, requires, install)
- [ ] Validate OpenClaw end-to-end behavior
- [ ] Publish to ClawHub or keep as workspace skill

## Non-goals (v1)

- GUI or web interface
- File watching (manual `tin index` is enough)
- Multi-project queries
- Binary/PDF parsing
- Built-in LLM summarization
- Query expansion
- MCP server
- Windows-first support
