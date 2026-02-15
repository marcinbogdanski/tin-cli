import { DEFAULT_EMBEDDING_MODEL } from "../core/constants.js";
import { TinError } from "../core/errors.js";

export type EmbeddingConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export function getEmbeddingConfigFromEnv(): EmbeddingConfig | null {
  const apiKey = process.env.TIN_EMBEDDING_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const baseUrl = (process.env.TIN_EMBEDDING_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.TIN_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;

  return {
    apiKey,
    baseUrl,
    model
  };
}

export async function embedTexts(config: EmbeddingConfig, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const response = await fetch(`${config.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      input: texts
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new TinError(`Embedding API request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ index: number; embedding: number[] }>;
  };

  if (!Array.isArray(payload.data)) {
    throw new TinError("Embedding API response missing data array");
  }

  const out = new Array<number[]>(texts.length);
  for (const item of payload.data) {
    out[item.index] = item.embedding;
  }

  for (let i = 0; i < out.length; i += 1) {
    if (!Array.isArray(out[i])) {
      throw new TinError("Embedding API response had incomplete vectors");
    }
  }

  return out;
}
