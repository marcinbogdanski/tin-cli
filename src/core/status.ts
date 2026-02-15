import { closeDatabase, getStatus, openDatabase } from "../storage/db.js";
import type { ProjectPaths } from "./project.js";
import type { StatusInfo } from "./types.js";
import { getConfiguredEmbeddingModel } from "./embeddings.js";
import { DEFAULT_EMBEDDING_MODEL } from "./constants.js";

const DEFAULT_EMBEDDING_BASE_URL = "https://api.openai.com/v1";

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

    const rawBaseUrl = process.env.TIN_EMBEDDING_BASE_URL?.trim();
    const rawModel = process.env.TIN_EMBEDDING_MODEL?.trim();
    const rawApiKey = process.env.TIN_EMBEDDING_API_KEY?.trim();

    return {
      ...status,
      embeddingApiUrl: (rawBaseUrl || DEFAULT_EMBEDDING_BASE_URL).replace(/\/$/, ""),
      embeddingApiUrlSource: rawBaseUrl ? "env var" : "default",
      embeddingModelName: rawModel || DEFAULT_EMBEDDING_MODEL,
      embeddingModelSource: rawModel ? "env var" : "default",
      embeddingApiKeyPreview: rawApiKey ? `${rawApiKey.slice(0, 6)}...` : "unset",
      embeddingApiKeySource: rawApiKey ? "env var" : "unset"
    };
  } finally {
    closeDatabase(db);
  }
}
