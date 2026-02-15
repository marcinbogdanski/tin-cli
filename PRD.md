# tin — Product Requirements Document

A command-line tool for searching local document collections using keyword and semantic search. Designed for personal knowledge bases (notes, docs, meeting transcripts) and agentic workflows — primarily as an OpenClaw skill.

## Context

- **Author:** Personal project, public GitHub repo.
- **Runtime:** Node.js (aligns with OpenClaw ecosystem, simple distribution via `npm i -g`, easy to hack on).
- **Primary consumer:** OpenClaw agent via a skill definition. Also usable directly from the terminal.
- **Prior art:** [qmd](https://github.com/tobi/qmd) by Tobi Lütke is the closest existing tool — same command structure, search tiers, and target audience. tin is a personal, hackable alternative.

## Differences from qmd

- Stores db file in `.tin` folder independently for each collection, no global storage.
- Only supports model invokation via API, no local built-in models.
- Just BM25+Vector search. No query expansion.
- No MCP support, just the CLI.

## Concepts

- **Project:** A folder tree of documents. Identified by a `.tin/` marker directory at the root.
- **Index:** A searchable representation of all documents in a project. Stored inside `.tin/`.

## Discovery

When invoked, the tool walks up from the current directory until it finds `.tin/`. This determines the project root and index location. Fails with a clear error if no project is found.

## Commands

### `tin init`

Create a new project in the current directory. Creates `.tin/` with default config.

### `tin index`

Scan all documents in the project. Build/update the search index. Only re-process files that have changed since last index. Report what was added, updated, and skipped.

### `tin search <query>`

Keyword search (BM25). Fast, no external dependencies. Returns ranked results.

### `tin vsearch <query>`

Semantic/vector search. Finds conceptually related documents even without keyword overlap. Requires an embedding API.

### `tin query <query>`

Hybrid search. Combines keyword and semantic results, then re-ranks for best quality. Requires embedding and reranking APIs.

### `tin status`

Show project info: root path, number of indexed documents, index freshness, embedding coverage.

## Search Results

Each result includes:

- File path (relative to project root)
- Position within file (line or section)
- Relevance score (normalized 0–1)
- Snippet with context around the match

Output formats: human-readable (default), JSON (`--json`), file list (`--files`).

## Document Types

Index all text-based files. Primarily markdown, but should handle plain text. PDFs and other binary formats are out of scope for v1.

## Incremental Updates

Indexing should be fast on repeat runs. Only new or modified files are processed. Deleted files are removed from the index. Use file mtime + content hash to detect changes.

## Configuration

Minimal. API keys via environment variables (`TIN_EMBEDDING_API_KEY`, etc.). File glob patterns (include/exclude) via `.tin/config.json`. Sensible defaults that work without configuration.

## OpenClaw Integration

tin is designed to be invoked by an OpenClaw agent via a skill. The skill definition should:

- Declare `tin` as a required binary (`requires.bins: ["tin"]`).
- Provide install instructions (`kind: "node"`, package name).
- Describe each command so the agent knows when to use keyword vs semantic vs hybrid search.
- Prefer `--json` output so the agent can parse results programmatically.

A `SKILL.md` should be authored alongside the CLI and published to the skill registry or kept in the workspace.

## Tech Stack

- **Language:** Node.js (ES modules, modern Node >= 20)
- **CLI framework:** TBD
- **Keyword search:** TBD
- **Embeddings:** TBD - OpenAI compatible API?
- **Vector storage:** TBD - sqlite in `.tin`?
- **Reranking:** API-based (details TBD, Cohere, Jina, or OpenAI-compatible?). Optional — hybrid search degrades gracefully to simple score fusion without it.

## Implementation Plan

### Phase 0 - Research

Focus ponits:
- decide project architecture, dependencies, API format, storage, tests, etc

Actions:
- [ ] Deeply research `qmd-reference-repo`
- [ ] Deeply research `openclaw-reference-repo` focusing on "hybrid search"
  - `node openclaw.mjs memory search --help` - cli command to invoke search, good starting point
- [ ] For each focus point, summarise options and provide recommendation

### Phase 1 — Scaffold + Keyword Search

- [ ] Project setup: package.json, ESM, bin entry point
- [ ] `tin init` — create `.tin/` directory
- [ ] `tin index` — walk files, tokenize, build BM25 index, persist to `.tin/index.json`
- [ ] `tin search <query>` — load index, run BM25, output results
- [ ] `tin status` — basic project info
- [ ] Incremental indexing (mtime + hash tracking in `.tin/manifest.json`)
- [ ] Output formats: human, `--json`, `--files`
- [ ] `.tin/config.json` for include/exclude globs

### Phase 2 — Semantic Search

- [ ] `tin index --embed` or automatic embedding during index if API key is set
- [ ] Embedding storage in `.tin/embeddings.bin` or similar
- [ ] `tin vsearch <query>` — embed query, cosine similarity against stored vectors
- [ ] Chunking strategy for long documents (by heading, paragraph, or fixed token window)

### Phase 3 — Hybrid + Reranking

- [ ] `tin query <query>` — run both BM25 and vector search, fuse with Reciprocal Rank Fusion (RRF)
- [ ] Optional reranking API call on fused results
- [ ] Score normalization to 0–1

### Phase 4 — OpenClaw Skill

- [ ] Author `SKILL.md` with frontmatter (name, description, requires, install)
- [ ] Test with OpenClaw agent end-to-end
- [ ] Publish to ClawHub or keep as workspace skill

## Non-goals (v1)

- GUI or web interface
- Watching for file changes (manual `tin index` is fine)
- Multi-project queries / collections
- Binary/PDF parsing
- Built-in LLM summarization
- Vector database (Chroma, Qdrant, etc.) — flat file is fine at personal scale
- Windows support (nice to have, not a priority)
