# tin

Local CLI search for project documents with BM25, vector search, and hybrid retrieval.

`tin` is designed for personal knowledge bases and agent workflows (especially OpenClaw skill usage), while staying simple to run and hack on.

## Status

- Phase 0 research: complete
- Phase 1 scaffold + keyword search: complete
- Phase 2 semantic search: complete
- Phase 3 hybrid query + optional rerank: complete
- Current stage: Phase 4 (OpenClaw skill packaging) next
- Project plan: see `PRD.md`
- Research decisions: see `PHASE0_RESEARCH.md`

## Implemented Now

- `tin init`
- `tin index` (incremental using mtime + hash; always runs embedding pass when configured)
- `tin search <query>` (BM25 + snippets)
- `tin status`
- `tin vsearch <query>` (requires embedding API env)
- `tin query <query>` (hybrid BM25+vector with optional rerank)
- `search`/`vsearch`/`query` currently force a full index refresh before searching; when embedding is configured they also force full re-embedding
- Output modes:
  - human
  - `--json`
  - `--files` (for `search` and `vsearch`)
- Project config at `.tin/config.json` (include/exclude globs)
- SQLite index at `.tin/index.sqlite` (built-in `node:sqlite`)
- Embedding support (OpenAI-compatible `/embeddings` API):
  - `TIN_EMBEDDING_PROVIDER` (optional, default `openai`)
  - `TIN_EMBEDDING_API_KEY`
  - `TIN_EMBEDDING_BASE_URL` (optional, default `https://api.openai.com/v1`)
  - `TIN_EMBEDDING_MODEL` (optional)
  - For `TIN_EMBEDDING_PROVIDER=openai`, fallback aliases are supported:
    - `OPENAI_API_KEY`
    - `OPENAI_BASE_URL`
- Optional rerank support (OpenAI-compatible `/rerank` API):
  - `TIN_RERANK_API_KEY`
  - `TIN_RERANK_BASE_URL` (optional, default `https://api.openai.com/v1`)
  - `TIN_RERANK_MODEL` (optional)

Embedding configuration precedence:

1. `TIN_*` env vars
2. Provider aliases (currently `OPENAI_*` for `openai`)
3. Built-in defaults

## Planned Next Features

- Semantic search (`tin vsearch`)
- Hybrid search with RRF (`tin query`)
- Optional reranking via API

## Technical Direction

Locked for v1:

- Node.js >= 22, TypeScript, ESM
- SQLite index at `.tin/index.sqlite`
- Built-in `node:sqlite` (no native DB addon dependency)
- BM25 + vector retrieval, hybrid via RRF
- OpenAI-compatible API integration first
- No query expansion, no MCP server in v1

## OpenClaw Fit

`tin` is intended to be consumed by OpenClaw through a skill definition.

Expected skill behavior:

- Require `tin` as installed binary
- Prefer `--json` output for tool parsing
- Choose `search`/`vsearch`/`query` based on query type and latency/quality tradeoffs

## Repository Docs

- Product requirements: `PRD.md`
- Phase 0 research: `PHASE0_RESEARCH.md`
- Agent continuity notes: `AGENTS.md`
- OpenClaw skill definition: `SKILL.md`

## License

MIT (`LICENSE`)
