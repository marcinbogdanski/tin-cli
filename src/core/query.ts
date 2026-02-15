import { searchProject } from "./search.js";
import { vectorSearchProject } from "./vector-search.js";
import type { ProjectPaths } from "./project.js";
import type { SearchResult } from "./types.js";
import { getRerankConfigFromEnv, rerankDocuments } from "../providers/rerank.js";
import { TinError } from "./errors.js";
import {
  DEFAULT_HYBRID_CANDIDATE_LIMIT,
  DEFAULT_RRF_K,
  DEFAULT_RRF_TOP1_BONUS,
  DEFAULT_RRF_TOP3_BONUS
} from "./constants.js";

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
  const candidateLimit = Math.max(DEFAULT_HYBRID_CANDIDATE_LIMIT, opts.limit);

  const bm25 = searchProject(project, query, {
    limit: candidateLimit,
    minScore: 0,
    fullChunk: true,
    highlight: opts.highlight
  }).map((r) => ({ ...r, source: "bm25" as const }));

  let vector: SearchResult[] = [];
  try {
    vector = await vectorSearchProject(project, query, {
      limit: candidateLimit,
      minScore: 0,
      fullChunk: true
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

  const fused = reciprocalRankFusionMerge({
    vector,
    keyword: bm25
  })
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
    const candidates = fused.slice(0, candidateLimit);
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

    const rerankRanked = [...reranked].sort((a, b) => b.score - a.score);
    const rerankMap = new Map(rerankRanked.map((r) => [r.id, r.score]));
    const rrfRankById = new Map(candidates.map((r, idx) => [keyForResult(r), idx + 1]));

    const blended = candidates
      .map((result) => {
        const key = keyForResult(result);
        const rank = rrfRankById.get(key) ?? candidateLimit;
        const rerankScore = rerankMap.get(key) ?? 0;
        const rrfScore = 1 / rank;
        const rrfWeight = rank <= 3 ? 0.75 : rank <= 10 ? 0.6 : 0.4;
        const score = rrfWeight * rrfScore + (1 - rrfWeight) * rerankScore;
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

function reciprocalRankFusionMerge(params: {
  vector: SearchResult[];
  keyword: SearchResult[];
}): SearchResult[] {
  const vectorWeight = 2;
  const keywordWeight = 2;

  const byId = new Map<
    string,
    SearchResult & {
      vectorScore: number;
      bm25Score: number;
      rrfScore: number;
      topRank: number;
    }
  >();

  const upsertRank = (
    result: SearchResult,
    params: { rank: number; weight: number; listType: "vector" | "keyword" }
  ): void => {
    const key = keyForResult(result);
    const existing = byId.get(key);
    const contribution = params.weight / (DEFAULT_RRF_K + params.rank + 1);
    if (existing) {
      existing.rrfScore += contribution;
      existing.topRank = Math.min(existing.topRank, params.rank);
      if (params.listType === "vector") {
        existing.vectorScore = Math.max(existing.vectorScore, result.score);
      } else {
        existing.bm25Score = Math.max(existing.bm25Score, result.score);
        existing.line = result.line;
        if (result.snippet.trim().length > 0) {
          existing.snippet = result.snippet;
        }
      }
    } else {
      byId.set(key, {
        ...result,
        vectorScore: params.listType === "vector" ? result.score : 0,
        bm25Score: params.listType === "keyword" ? result.score : 0,
        rrfScore: contribution,
        topRank: params.rank
      });
    }
  };

  for (let rank = 0; rank < params.vector.length; rank += 1) {
    const result = params.vector[rank];
    if (!result) {
      continue;
    }
    upsertRank(result, { rank, weight: vectorWeight, listType: "vector" });
  }

  for (let rank = 0; rank < params.keyword.length; rank += 1) {
    const result = params.keyword[rank];
    if (!result) {
      continue;
    }
    upsertRank(result, { rank, weight: keywordWeight, listType: "keyword" });
  }

  return Array.from(byId.values())
    .map(({ vectorScore, bm25Score, rrfScore, topRank, ...result }) => ({
      ...result,
      vectorScore,
      bm25Score,
      score: applyTopRankBonus(rrfScore, topRank)
    }))
    .sort((a, b) => b.score - a.score);
}

function applyTopRankBonus(score: number, topRank: number): number {
  if (topRank === 0) {
    return score + DEFAULT_RRF_TOP1_BONUS;
  }
  if (topRank <= 2) {
    return score + DEFAULT_RRF_TOP3_BONUS;
  }
  return score;
}

function keyForResult(result: Pick<SearchResult, "path" | "startLine" | "endLine">): string {
  return `${result.path}:${result.startLine}:${result.endLine}`;
}
