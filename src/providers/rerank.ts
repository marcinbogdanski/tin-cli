import { TinError } from "../core/errors.js";

export type RerankConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type RerankDoc = {
  id: string;
  text: string;
};

export function getRerankConfigFromEnv(): RerankConfig | null {
  const apiKey = process.env.TIN_RERANK_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const baseUrl = (process.env.TIN_RERANK_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.TIN_RERANK_MODEL?.trim() || "rerank-v1";

  return {
    apiKey,
    baseUrl,
    model
  };
}

export async function rerankDocuments(
  config: RerankConfig,
  query: string,
  documents: RerankDoc[]
): Promise<Array<{ id: string; score: number }>> {
  if (documents.length === 0) {
    return [];
  }

  const response = await fetch(`${config.baseUrl}/rerank`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      query,
      documents: documents.map((d) => d.text),
      top_n: documents.length
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new TinError(`Rerank API request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ index: number; relevance_score?: number; score?: number }>;
    results?: Array<{ index: number; relevance_score?: number; score?: number }>;
  };

  const items = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.results)
      ? payload.results
      : null;

  if (!items) {
    throw new TinError("Rerank API response missing results array");
  }

  return items
    .map((item) => {
      const doc = documents[item.index];
      if (!doc) {
        return null;
      }
      return {
        id: doc.id,
        score: Number.isFinite(item.relevance_score) ? item.relevance_score! : item.score ?? 0
      };
    })
    .filter((item): item is { id: string; score: number } => item !== null);
}
