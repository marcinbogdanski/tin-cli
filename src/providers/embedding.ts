import { DEFAULT_EMBEDDING_MODEL } from "../core/constants.js";
import { TinError } from "../core/errors.js";

const DEFAULT_EMBEDDING_BASE_URL = "https://api.openai.com/v1";

export type EmbeddingProvider = "openai";

export type EmbeddingConfig = {
  provider: EmbeddingProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type EmbeddingResolvedSettings = {
  provider: EmbeddingProvider;
  providerSource: string;
  apiKey: string | null;
  apiKeySource: string;
  baseUrl: string;
  baseUrlSource: string;
  model: string;
  modelSource: string;
};

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function resolveEmbeddingSettingsFromEnv(): EmbeddingResolvedSettings {
  const rawProvider = readEnv("TIN_EMBEDDING_PROVIDER");
  const providerValue = (rawProvider ?? "openai").toLowerCase();
  if (providerValue !== "openai") {
    throw new TinError(
      `Unsupported embedding provider '${providerValue}'. Supported providers: openai.`
    );
  }

  const providerSource = rawProvider ? "env var: TIN_EMBEDDING_PROVIDER" : "default";
  const provider: EmbeddingProvider = "openai";

  const tinApiKey = readEnv("TIN_EMBEDDING_API_KEY");
  const openaiApiKey = readEnv("OPENAI_API_KEY");
  const apiKey = tinApiKey ?? openaiApiKey;
  const apiKeySource = tinApiKey
    ? "env var: TIN_EMBEDDING_API_KEY"
    : openaiApiKey
      ? "env var: OPENAI_API_KEY"
      : "unset";

  const tinBaseUrl = readEnv("TIN_EMBEDDING_BASE_URL");
  const openaiBaseUrl = readEnv("OPENAI_BASE_URL");
  const baseUrl = (tinBaseUrl ?? openaiBaseUrl ?? DEFAULT_EMBEDDING_BASE_URL).replace(/\/$/, "");
  const baseUrlSource = tinBaseUrl
    ? "env var: TIN_EMBEDDING_BASE_URL"
    : openaiBaseUrl
      ? "env var: OPENAI_BASE_URL"
      : "default";

  const model = readEnv("TIN_EMBEDDING_MODEL") ?? DEFAULT_EMBEDDING_MODEL;
  const modelSource = readEnv("TIN_EMBEDDING_MODEL")
    ? "env var: TIN_EMBEDDING_MODEL"
    : "default";

  return {
    provider,
    providerSource,
    apiKey,
    apiKeySource,
    baseUrl,
    baseUrlSource,
    model,
    modelSource
  };
}

export function getEmbeddingConfigFromEnv(): EmbeddingConfig | null {
  const resolved = resolveEmbeddingSettingsFromEnv();
  const apiKey = resolved.apiKey;
  if (!apiKey) {
    return null;
  }

  return {
    provider: resolved.provider,
    apiKey,
    baseUrl: resolved.baseUrl,
    model: resolved.model
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
