import { closeDatabase, openDatabase, searchVector } from "../storage/db.js";
import type { SearchResult } from "./types.js";
import type { ProjectPaths } from "./project.js";
import { embedQuery } from "./embeddings.js";

export async function vectorSearchProject(
  project: ProjectPaths,
  query: string,
  opts: { limit: number; minScore: number }
): Promise<SearchResult[]> {
  const { vector, model } = await embedQuery(query);
  const db = openDatabase(project.dbPath);
  try {
    return searchVector(db, vector, model, {
      limit: opts.limit,
      minScore: opts.minScore
    });
  } finally {
    closeDatabase(db);
  }
}
