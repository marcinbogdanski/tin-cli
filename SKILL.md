---
name: tin
description: Search local project documents with the tin CLI using fast BM25 (search), semantic vector search (vsearch), and hybrid retrieval (query). Use when you need recall from markdown/text knowledge files in the current workspace.
metadata:
  {
    "openclaw":
      {
        "requires": { "bins": ["tin"] },
        "install":
          [
            {
              "id": "node",
              "kind": "node",
              "package": "tin-cli",
              "bins": ["tin"],
              "label": "Install tin CLI (npm)",
            },
          ],
      },
  }
---

# tin

Use `tin` for local knowledge retrieval from the nearest `.tin/` project.

Selection guide

- Use `tin search <query> --json` for exact keywords, symbols, filenames, and fast retrieval.
- Use `tin vsearch <query> --json` for semantic matches when wording differs.
- Use `tin query <query> --json` for best overall quality (BM25 + vector fusion, optional rerank).

Core commands

```bash
tin init
tin index
tin index --embed

# retrieval
tin search "deployment checklist" --json
tin vsearch "how we ship releases" --json
tin query "incident response playbook" --json

# machine-friendly file list
tin search "auth" --files
```

Output conventions

- Prefer `--json` when results will be parsed by an agent.
- Use `--files` when only path lists are needed.

Embedding config

- `TIN_EMBEDDING_API_KEY` (required for `vsearch`/hybrid vector side)
- `TIN_EMBEDDING_BASE_URL` (optional; default `https://api.openai.com/v1`)
- `TIN_EMBEDDING_MODEL` (optional)

Optional rerank config (for `tin query`)

- `TIN_RERANK_API_KEY`
- `TIN_RERANK_BASE_URL`
- `TIN_RERANK_MODEL`

Notes

- `tin query` degrades to BM25-only with warning when embeddings are unavailable.
- Index is project-local at `.tin/index.sqlite`.
- `tin` indexes markdown and plain text files by default (`.tin/config.json` controls include/exclude).
