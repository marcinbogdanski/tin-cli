import { DEFAULT_EMBEDDING_MODEL } from "../core/constants.js";
import { TinError } from "../core/errors.js";

const DEFAULT_EMBEDDING_BASE_URL: Record<EmbeddingProvider, string> = {
  openai: "https://api.openai.com/v1",
  voyage: "https://api.voyageai.com/v1"
};

const DEFAULT_EMBEDDING_MODEL_BY_PROVIDER: Record<EmbeddingProvider, string> = {
  openai: DEFAULT_EMBEDDING_MODEL,
  voyage: "voyage-4-large"
};

export type EmbeddingProvider = "openai" | "voyage";

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

function getProviderEnvAliases(
  provider: EmbeddingProvider
): {
  apiKey: Array<{ name: string; value: string | null }>;
  baseUrl: Array<{ name: string; value: string | null }>;
} {
  if (provider === "voyage") {
    return {
      apiKey: [{ name: "VOYAGE_API_KEY", value: readEnv("VOYAGE_API_KEY") }],
      baseUrl: [
        { name: "VOYAGE_BASE_URL", value: readEnv("VOYAGE_BASE_URL") },
        { name: "VOYAGE_API_BASE", value: readEnv("VOYAGE_API_BASE") }
      ]
    };
  }

  return {
    apiKey: [{ name: "OPENAI_API_KEY", value: readEnv("OPENAI_API_KEY") }],
    baseUrl: [
      { name: "OPENAI_BASE_URL", value: readEnv("OPENAI_BASE_URL") },
      { name: "OPENAI_API_BASE", value: readEnv("OPENAI_API_BASE") }
    ]
  };
}

export function resolveEmbeddingSettingsFromEnv(): EmbeddingResolvedSettings {
  const rawProvider = readEnv("TIN_EMBEDDING_PROVIDER");
  const providerValue = (rawProvider ?? "openai").toLowerCase() as EmbeddingProvider;
  if (providerValue !== "openai" && providerValue !== "voyage") {
    throw new TinError(
      `Unsupported embedding provider '${providerValue}'. Supported providers: openai, voyage.`
    );
  }

  const providerSource = rawProvider ? "env var: TIN_EMBEDDING_PROVIDER" : "default";
  const provider: EmbeddingProvider = providerValue;

  const tinApiKey = readEnv("TIN_EMBEDDING_API_KEY");
  const aliases = getProviderEnvAliases(provider);
  const aliasApiKey = aliases.apiKey.find((item) => item.value !== null);
  const apiKey = tinApiKey ?? aliasApiKey?.value ?? null;
  const apiKeySource = tinApiKey
    ? "env var: TIN_EMBEDDING_API_KEY"
    : aliasApiKey
      ? `env var: ${aliasApiKey.name}`
      : "unset";

  const tinBaseUrl = readEnv("TIN_EMBEDDING_BASE_URL");
  const aliasBaseUrl = aliases.baseUrl.find((item) => item.value !== null);
  const baseUrl = (tinBaseUrl ?? aliasBaseUrl?.value ?? DEFAULT_EMBEDDING_BASE_URL[provider]).replace(
    /\/$/,
    ""
  );
  const baseUrlSource = tinBaseUrl
    ? "env var: TIN_EMBEDDING_BASE_URL"
    : aliasBaseUrl
      ? `env var: ${aliasBaseUrl.name}`
      : "default";

  const model = readEnv("TIN_EMBEDDING_MODEL") ?? DEFAULT_EMBEDDING_MODEL_BY_PROVIDER[provider];
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

  type DataItem = { index?: number; embedding?: number[] };
  type EmbeddingsItem = number[] | { index?: number; embedding?: number[] };
  const payload = (await response.json()) as {
    data?: DataItem[];
    embeddings?: EmbeddingsItem[];
  };

  const out = new Array<number[]>(texts.length);

  if (Array.isArray(payload.data)) {
    for (let i = 0; i < payload.data.length; i += 1) {
      const item: DataItem | undefined = payload.data[i];
      if (!item || !Array.isArray(item.embedding)) {
        continue;
      }
      const index = Number.isInteger(item.index) ? (item.index as number) : i;
      out[index] = item.embedding;
    }
  } else if (Array.isArray(payload.embeddings)) {
    for (let i = 0; i < payload.embeddings.length; i += 1) {
      const item: EmbeddingsItem | undefined = payload.embeddings[i];
      if (Array.isArray(item)) {
        out[i] = item;
        continue;
      }
      if (!item || !Array.isArray(item.embedding)) {
        continue;
      }
      const index = Number.isInteger(item.index) ? (item.index as number) : i;
      out[index] = item.embedding;
    }
  } else {
    throw new TinError("Embedding API response missing data/embeddings array");
  }

  for (let i = 0; i < out.length; i += 1) {
    if (!Array.isArray(out[i])) {
      throw new TinError("Embedding API response had incomplete vectors");
    }
  }

  return out;
}
