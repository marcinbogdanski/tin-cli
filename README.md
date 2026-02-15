# tin

Local CLI search for project documents with BM25, vector search, and hybrid retrieval.

`tin` is designed for personal knowledge bases and agent workflows (especially OpenClaw skill usage), while staying simple to run and hack on.

## Status

- Phase 0 research: complete
- Current stage: pre-implementation (Phase 1 next)
- Project plan: see `PRD.md`
- Research decisions: see `PHASE0_RESEARCH.md`

## Planned Features

- Project-local indexing (`.tin/` per workspace)
- Incremental indexing (mtime + content hash)
- Keyword search (`tin search`)
- Semantic search (`tin vsearch`)
- Hybrid search with RRF (`tin query`)
- Optional reranking via API
- Output formats:
  - human (default)
  - `--json`
  - `--files`

## Command Surface (Target)

- `tin init`
- `tin index`
- `tin search <query>`
- `tin vsearch <query>`
- `tin query <query>`
- `tin status`

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

## License

MIT (`LICENSE`)
