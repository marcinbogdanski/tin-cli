import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import { chunkByLines } from "./chunks.js";
import { hashContent } from "./hash.js";
import type { TinConfig, IndexStats } from "./types.js";
import type { ProjectPaths } from "./project.js";
import {
  closeDatabase,
  deleteMissingFiles,
  listIndexedFiles,
  openDatabase,
  updateFileMetadata,
  upsertFileAndChunks
} from "../storage/db.js";

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function indexProject(project: ProjectPaths, config: TinConfig): IndexStats {
  const db = openDatabase(project.dbPath);
  const stats: IndexStats = {
    scanned: 0,
    added: 0,
    updated: 0,
    skipped: 0,
    removed: 0,
    errors: 0
  };

  try {
    const include = config.include.length > 0 ? config.include : ["**/*.md", "**/*.txt"];
    const exclude = [...new Set(config.exclude)];

    const files = fg.sync(include, {
      cwd: project.rootPath,
      dot: false,
      onlyFiles: true,
      unique: true,
      ignore: exclude,
      followSymbolicLinks: false
    });

    const indexed = listIndexedFiles(db);
    const seenPaths = new Set<string>();
    const indexedAt = new Date().toISOString();

    for (const relFile of files) {
      stats.scanned += 1;
      const relPath = normalizeRelativePath(relFile);
      seenPaths.add(relPath);

      const absPath = join(project.rootPath, relFile);

      let fileStat: ReturnType<typeof statSync>;
      try {
        fileStat = statSync(absPath);
      } catch {
        stats.errors += 1;
        continue;
      }

      const existing = indexed.get(relPath);
      const mtimeMs = Math.floor(fileStat.mtimeMs);
      const sizeBytes = fileStat.size;

      if (existing && existing.mtimeMs === mtimeMs && existing.sizeBytes === sizeBytes) {
        stats.skipped += 1;
        continue;
      }

      let content: string;
      try {
        content = readFileSync(absPath, "utf8");
      } catch {
        stats.errors += 1;
        continue;
      }

      if (content.trim().length === 0) {
        if (existing) {
          updateFileMetadata(db, {
            path: relPath,
            mtimeMs,
            sizeBytes,
            indexedAt
          });
        }
        stats.skipped += 1;
        continue;
      }

      const hash = hashContent(content);
      if (existing && existing.hash === hash) {
        updateFileMetadata(db, {
          path: relPath,
          mtimeMs,
          sizeBytes,
          indexedAt
        });
        stats.skipped += 1;
        continue;
      }

      const chunks = chunkByLines(content);
      upsertFileAndChunks(db, {
        path: relPath,
        hash,
        mtimeMs,
        sizeBytes,
        chunks,
        indexedAt
      });

      if (existing) {
        stats.updated += 1;
      } else {
        stats.added += 1;
      }
    }

    stats.removed = deleteMissingFiles(db, seenPaths);
    return stats;
  } finally {
    closeDatabase(db);
  }
}
