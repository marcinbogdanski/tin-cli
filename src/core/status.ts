import { closeDatabase, getStatus, openDatabase } from "../storage/db.js";
import type { ProjectPaths } from "./project.js";
import type { StatusInfo } from "./types.js";
import { getConfiguredEmbeddingModel } from "./embeddings.js";

export function getProjectStatus(project: ProjectPaths): StatusInfo {
  const db = openDatabase(project.dbPath);
  try {
    return getStatus(
      db,
      {
        rootPath: project.rootPath,
        tinPath: project.tinPath,
        dbPath: project.dbPath
      },
      getConfiguredEmbeddingModel()
    );
  } finally {
    closeDatabase(db);
  }
}
