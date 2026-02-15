import { closeDatabase, openDatabase, searchBm25 } from "../storage/db.js";
import type { ProjectPaths } from "./project.js";
import type { SearchResult } from "./types.js";

export function searchProject(
  project: ProjectPaths,
  query: string,
  opts: { limit: number; minScore: number }
): SearchResult[] {
  const db = openDatabase(project.dbPath);
  try {
    return searchBm25(db, query, {
      limit: opts.limit,
      minScore: opts.minScore
    });
  } finally {
    closeDatabase(db);
  }
}
