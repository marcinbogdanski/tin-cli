import { searchProject } from "./search.js";
import { vectorSearchProject } from "./vector-search.js";
import type { ProjectPaths } from "./project.js";
import type { SearchResult } from "./types.js";
import { getRerankConfigFromEnv, rerankDocuments } from "../providers/rerank.js";
import { TinError } from "./errors.js";

export type QueryOutput = {
  results: SearchResult[];
  warnings: string[];
};

export async function queryProject(
  project: ProjectPaths,
  query: string,
  opts: {
    limit: number;
    minScore: number;
    useRerank?: boolean;
    highlight?: {
      pre: string;
      post: string;
    };
  }
): Promise<QueryOutput> {
  const warnings: string[] = [];
  const candidateLimit = Math.max(opts.limit * 4, opts.limit);

  const bm25 = searchProject(project, query, {
    limit: candidateLimit,
    minScore: 0,
    highlight: opts.highlight
  }).map((r) => ({ ...r, source: "bm25" as const }));

  let vector: SearchResult[] = [];
  try {
    vector = await vectorSearchProject(project, query, {
      limit: candidateLimit,
      minScore: 0
    });
  } catch (err) {
    if (err instanceof TinError && err.message.includes("Embedding is not configured")) {
      warnings.push("Embeddings are not configured, falling back to BM25-only results.");
    } else if (err instanceof Error) {
      warnings.push(`Vector search failed: ${err.message}. Falling back to BM25-only results.`);
    } else {
      warnings.push("Vector search failed. Falling back to BM25-only results.");
    }
  }

  if (vector.length === 0) {
    const bmOnly = bm25.filter((r) => r.score >= opts.minScore).slice(0, opts.limit);
    return {
      results: bmOnly,
      warnings
    };
  }

  const fused = reciprocalRankFusion([bm25, vector], 60)
    .map((r) => ({ ...r, source: "hybrid" as const }))
    .filter((r) => r.score >= opts.minScore);

  if (!opts.useRerank) {
    return {
      results: fused.slice(0, opts.limit),
      warnings
    };
  }

  const rerankCfg = getRerankConfigFromEnv();
  if (!rerankCfg) {
    warnings.push("Rerank is not configured; returning fused BM25+vector results.");
    return {
      results: fused.slice(0, opts.limit),
      warnings
    };
  }

  try {
    const candidates = fused.slice(0, Math.max(opts.limit * 3, opts.limit));
    const docs = candidates.map((r) => ({
      id: keyForResult(r),
      text: `${r.path}\n${r.snippet}`
    }));

    const reranked = await rerankDocuments(rerankCfg, query, docs);
    if (reranked.length === 0) {
      return {
        results: fused.slice(0, opts.limit),
        warnings
      };
    }

    const rerankMap = new Map(reranked.map((r) => [r.id, r.score]));
    const rerankScores = reranked.map((r) => r.score);
    const min = Math.min(...rerankScores);
    const max = Math.max(...rerankScores);
    const span = Math.max(1e-9, max - min);

    const blended = candidates
      .map((result) => {
        const raw = rerankMap.get(keyForResult(result));
        const normalized = raw === undefined ? 0 : (raw - min) / span;
        const score = 0.6 * result.score + 0.4 * normalized;
        return {
          ...result,
          score
        };
      })
      .sort((a, b) => b.score - a.score);

    return {
      results: blended.slice(0, opts.limit),
      warnings
    };
  } catch (err) {
    warnings.push(
      `Rerank failed${err instanceof Error ? `: ${err.message}` : ""}. Returning fused BM25+vector results.`
    );
    return {
      results: fused.slice(0, opts.limit),
      warnings
    };
  }
}

function reciprocalRankFusion(lists: SearchResult[][], k: number): SearchResult[] {
  const byId = new Map<string, SearchResult & { _rrf: number }>();

  lists.forEach((list) => {
    list.forEach((result, idx) => {
      const key = keyForResult(result);
      const contribution = 1 / (k + idx + 1);
      const existing = byId.get(key);
      if (existing) {
        existing._rrf += contribution;
      } else {
        byId.set(key, {
          ...result,
          _rrf: contribution
        });
      }
    });
  });

  const ranked = Array.from(byId.values()).sort((a, b) => b._rrf - a._rrf);
  const maxScore = ranked[0]?._rrf ?? 1;

  return ranked.map(({ _rrf, ...rest }) => ({
    ...rest,
    score: _rrf / maxScore
  }));
}

function keyForResult(result: Pick<SearchResult, "path" | "startLine" | "endLine">): string {
  return `${result.path}:${result.startLine}:${result.endLine}`;
}
