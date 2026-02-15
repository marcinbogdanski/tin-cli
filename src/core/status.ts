import { closeDatabase, getStatus, openDatabase } from "../storage/db.js";
import type { ProjectPaths } from "./project.js";
import type { StatusInfo } from "./types.js";
import { getConfiguredEmbeddingModel } from "./embeddings.js";
import { resolveEmbeddingSettingsFromEnv } from "../providers/embedding.js";

export function getProjectStatus(project: ProjectPaths): StatusInfo {
  const db = openDatabase(project.dbPath);
  try {
    const status = getStatus(
      db,
      {
        rootPath: project.rootPath,
        tinPath: project.tinPath,
        dbPath: project.dbPath
      },
      getConfiguredEmbeddingModel()
    );
    const embedding = resolveEmbeddingSettingsFromEnv();

    return {
      ...status,
      embeddingProviderName: embedding.provider,
      embeddingProviderSource: embedding.providerSource,
      embeddingApiUrl: embedding.baseUrl,
      embeddingApiUrlSource: embedding.baseUrlSource,
      embeddingModelName: embedding.model,
      embeddingModelSource: embedding.modelSource,
      embeddingApiKeyPreview: embedding.apiKey ? `${embedding.apiKey.slice(0, 6)}...` : "unset",
      embeddingApiKeySource: embedding.apiKeySource
    };
  } finally {
    closeDatabase(db);
  }
}
