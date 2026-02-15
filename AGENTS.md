# AGENTS.md

This file captures durable project context for future Codex sessions.

## Purpose

Build `tin`, a local-first CLI search tool for project documents.

Primary source docs:

- `PRD.md`
- `PHASE0_RESEARCH.md`

## Current Status

- Phase 0 is complete.
- Phase 1 has not started.
- No production code scaffold exists yet.

## Locked Decisions

- Runtime: Node.js >= 22, TypeScript, ESM.
- Index storage: `.tin/index.sqlite` from Phase 1 onward.
- Use built-in `node:sqlite` (no `better-sqlite3`).
- Retrieval modes:
  - `search`: BM25
  - `vsearch`: vector
  - `query`: BM25 + vector via RRF, optional rerank
- No query expansion in v1.
- No MCP support in v1.
- API-based embeddings/rerank only (OpenAI-compatible first).

## Expected Commands (Target Behavior)

- `tin init`
- `tin index`
- `tin search <query>`
- `tin vsearch <query>`
- `tin query <query>`
- `tin status`

## Output Contracts (Target)

- Human-readable default output
- `--json` machine-readable output
- `--files` unique file path list output

## Phase 1 Implementation Checklist

1. Scaffold project (`package.json`, TS config, bin entry).
2. Implement project root discovery by locating `.tin/` upward.
3. Implement `tin init`.
4. Add SQLite schema bootstrap and migrations.
5. Implement incremental indexer (`mtime + hash` tracking).
6. Build BM25 retrieval path and snippet extraction.
7. Implement `tin search` + `tin status`.
8. Add output modes (`human`, `json`, `files`).
9. Add tests (unit + storage + CLI integration).

## Design Notes for Future Sessions

- Keep CLI layer thin; put indexing/search logic in `src/core`.
- Keep storage and SQL in `src/storage`.
- Provider/network logic should stay in `src/providers`.
- Do not add local model dependencies for v1.
- Prefer pure-Node dependencies; avoid native addons where possible.
- Prefer deterministic behavior over heuristic-heavy features in early phases.

## Guardrails

- Do not reintroduce JSON index artifacts (`index.json`, `embeddings.bin`) unless PRD is explicitly changed.
- If embeddings are unavailable, `tin query` should degrade to BM25 with warning.
- Rerank should remain optional/opt-in.

## Recommended Next Step

Start Phase 1 by scaffolding the CLI project and implementing `tin init` + project discovery first.
