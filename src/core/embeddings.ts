import type { ProjectPaths } from "./project.js";
import { TinError } from "./errors.js";
import {
  closeDatabase,
  deleteEmbeddingsForModel,
  listChunksMissingEmbeddings,
  openDatabase,
  upsertEmbeddings
} from "../storage/db.js";
import { embedTexts, getEmbeddingConfigFromEnv } from "../providers/embedding.js";

export function hasEmbeddingConfiguration(): boolean {
  return getEmbeddingConfigFromEnv() !== null;
}

export function getConfiguredEmbeddingModel(): string | null {
  return getEmbeddingConfigFromEnv()?.model ?? null;
}

export async function embedMissingChunks(
  project: ProjectPaths,
  options?: { batchSize?: number; force?: boolean }
): Promise<{ embedded: number; model: string }> {
  const config = getEmbeddingConfigFromEnv();
  if (!config) {
    throw new TinError(
      "Embedding is not configured. Set TIN_EMBEDDING_API_KEY (or provider alias: OPENAI_API_KEY / VOYAGE_API_KEY)."
    );
  }

  const batchSize = options?.batchSize ?? 32;
  const db = openDatabase(project.dbPath);

  try {
    if (options?.force) {
      deleteEmbeddingsForModel(db, config.model);
    }

    let embedded = 0;

    while (true) {
      const pending = listChunksMissingEmbeddings(db, config.model, batchSize);
      if (pending.length === 0) {
        break;
      }

      const vectors = await embedTexts(
        config,
        pending.map((chunk) => chunk.text)
      );

      upsertEmbeddings(
        db,
        config.model,
        pending.map((chunk, idx) => ({
          chunkId: chunk.chunkId,
          vector: vectors[idx] ?? []
        }))
      );

      embedded += pending.length;
    }

    return { embedded, model: config.model };
  } finally {
    closeDatabase(db);
  }
}

export async function embedQuery(query: string): Promise<{ vector: number[]; model: string }> {
  const config = getEmbeddingConfigFromEnv();
  if (!config) {
    throw new TinError(
      "Embedding is not configured. Set TIN_EMBEDDING_API_KEY (or provider alias: OPENAI_API_KEY / VOYAGE_API_KEY)."
    );
  }

  const vectors = await embedTexts(config, [query]);
  const vector = vectors[0];
  if (!vector || vector.length === 0) {
    throw new TinError("Embedding API returned an empty query vector");
  }

  return { vector, model: config.model };
}
