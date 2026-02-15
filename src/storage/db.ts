import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Chunk } from "../core/chunks.js";
import type { SearchResult, StatusInfo } from "../core/types.js";

export type StoredFile = {
  path: string;
  hash: string;
  mtimeMs: number;
  sizeBytes: number;
};

export type SearchOptions = {
  limit: number;
  minScore: number;
  fullChunk?: boolean;
};

export type PendingEmbeddingChunk = {
  chunkId: number;
  text: string;
};

export function openDatabase(dbPath: string): DatabaseSync {
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  initializeSchema(db);
  return db;
}

function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      mtime_ms INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      indexed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      content TEXT NOT NULL,
      UNIQUE(path, chunk_index),
      FOREIGN KEY(path) REFERENCES files(path) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);

    CREATE TABLE IF NOT EXISTS embeddings (
      chunk_id INTEGER NOT NULL,
      model TEXT NOT NULL,
      vector TEXT NOT NULL,
      embedded_at TEXT NOT NULL,
      PRIMARY KEY(chunk_id, model),
      FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(model);

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      path,
      content,
      content='chunks',
      content_rowid='id',
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, path, content)
      VALUES (new.id, new.path, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, path, content)
      VALUES('delete', old.id, old.path, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, path, content)
      VALUES('delete', old.id, old.path, old.content);
      INSERT INTO chunks_fts(rowid, path, content)
      VALUES (new.id, new.path, new.content);
    END;
  `);
}

export function listIndexedFiles(db: DatabaseSync): Map<string, StoredFile> {
  const rows = db
    .prepare("SELECT path, hash, mtime_ms, size_bytes FROM files")
    .all() as Array<{ path: string; hash: string; mtime_ms: number; size_bytes: number }>;

  const out = new Map<string, StoredFile>();
  for (const row of rows) {
    out.set(row.path, {
      path: row.path,
      hash: row.hash,
      mtimeMs: row.mtime_ms,
      sizeBytes: row.size_bytes
    });
  }
  return out;
}

export function upsertFileAndChunks(
  db: DatabaseSync,
  params: {
    path: string;
    hash: string;
    mtimeMs: number;
    sizeBytes: number;
    chunks: Chunk[];
    indexedAt: string;
  }
): void {
  withTransaction(db, () => {
    db.prepare(
      `INSERT INTO files(path, hash, mtime_ms, size_bytes, indexed_at)
       VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         hash = excluded.hash,
         mtime_ms = excluded.mtime_ms,
         size_bytes = excluded.size_bytes,
         indexed_at = excluded.indexed_at`
    ).run(params.path, params.hash, params.mtimeMs, params.sizeBytes, params.indexedAt);

    db.prepare("DELETE FROM chunks WHERE path = ?").run(params.path);

    const insertChunk = db.prepare(
      `INSERT INTO chunks(path, chunk_index, start_line, end_line, content)
       VALUES(?, ?, ?, ?, ?)`
    );
    for (const chunk of params.chunks) {
      insertChunk.run(params.path, chunk.index, chunk.startLine, chunk.endLine, chunk.text);
    }
  });
}

export function updateFileMetadata(
  db: DatabaseSync,
  params: { path: string; mtimeMs: number; sizeBytes: number; indexedAt: string }
): void {
  db.prepare(
    `UPDATE files
     SET mtime_ms = ?, size_bytes = ?, indexed_at = ?
     WHERE path = ?`
  ).run(params.mtimeMs, params.sizeBytes, params.indexedAt, params.path);
}

export function deleteMissingFiles(db: DatabaseSync, existingPaths: Set<string>): number {
  const rows = db.prepare("SELECT path FROM files").all() as Array<{ path: string }>;
  let removed = 0;

  withTransaction(db, () => {
    const deleteFile = db.prepare("DELETE FROM files WHERE path = ?");
    for (const row of rows) {
      if (!existingPaths.has(row.path)) {
        deleteFile.run(row.path);
        removed += 1;
      }
    }
  });

  return removed;
}

export function listChunksMissingEmbeddings(
  db: DatabaseSync,
  model: string,
  limit: number = 200
): PendingEmbeddingChunk[] {
  return db
    .prepare(
      `SELECT c.id AS chunkId, c.content AS text
       FROM chunks c
       LEFT JOIN embeddings e ON e.chunk_id = c.id AND e.model = ?
       WHERE e.chunk_id IS NULL
       ORDER BY c.id ASC
       LIMIT ?`
    )
    .all(model, limit) as PendingEmbeddingChunk[];
}

export function upsertEmbeddings(
  db: DatabaseSync,
  model: string,
  vectors: Array<{ chunkId: number; vector: number[] }>
): void {
  if (vectors.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  withTransaction(db, () => {
    const stmt = db.prepare(
      `INSERT INTO embeddings(chunk_id, model, vector, embedded_at)
       VALUES(?, ?, ?, ?)
       ON CONFLICT(chunk_id, model) DO UPDATE SET
         vector = excluded.vector,
         embedded_at = excluded.embedded_at`
    );

    for (const item of vectors) {
      stmt.run(item.chunkId, model, JSON.stringify(item.vector), now);
    }
  });
}

export function searchBm25(db: DatabaseSync, query: string, opts: SearchOptions): SearchResult[] {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) {
    return [];
  }

  const rows = db
    .prepare(
      `SELECT
         c.path,
         c.start_line,
         c.end_line,
         c.content,
         bm25(chunks_fts) AS bm25_score
       FROM chunks_fts
       JOIN chunks c ON c.id = chunks_fts.rowid
       WHERE chunks_fts MATCH ?
       ORDER BY bm25_score ASC
       LIMIT ?`
    )
    .all(ftsQuery, opts.limit) as Array<{
    path: string;
    start_line: number;
    end_line: number;
    content: string;
    bm25_score: number;
  }>;

  const terms = tokenizeQuery(query);

  const out: SearchResult[] = [];
  for (const row of rows) {
    const score = normalizeBm25(row.bm25_score);
    if (score < opts.minScore) {
      continue;
    }

    const lineOffset = findBestLineOffset(row.content, terms);
    const line = row.start_line + lineOffset;
    const snippet = makeSnippet(row.content, lineOffset);

    out.push({
      path: row.path,
      line,
      startLine: row.start_line,
      endLine: row.end_line,
      score,
      snippet,
      source: "bm25"
    });
  }

  return out;
}

export function searchVector(
  db: DatabaseSync,
  queryVector: number[],
  model: string,
  opts: SearchOptions
): SearchResult[] {
  const rows = db
    .prepare(
      `SELECT c.path, c.start_line, c.end_line, c.content, e.vector
       FROM embeddings e
       JOIN chunks c ON c.id = e.chunk_id
       WHERE e.model = ?`
    )
    .all(model) as Array<{
    path: string;
    start_line: number;
    end_line: number;
    content: string;
    vector: string;
  }>;

  const scored: SearchResult[] = [];
  for (const row of rows) {
    const vec = parseVector(row.vector);
    if (vec.length === 0 || vec.length !== queryVector.length) {
      continue;
    }

    const cosine = cosineSimilarity(queryVector, vec);
    const normalized = (cosine + 1) / 2;
    if (normalized < opts.minScore) {
      continue;
    }

    scored.push({
      path: row.path,
      line: row.start_line,
      startLine: row.start_line,
      endLine: row.end_line,
      score: normalized,
      snippet: opts.fullChunk ? row.content : makeSnippet(row.content, 0),
      source: "vector"
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, opts.limit);
}

export function getStatus(
  db: DatabaseSync,
  paths: { rootPath: string; tinPath: string; dbPath: string },
  model?: string | null
): StatusInfo {
  const fileCount = db.prepare("SELECT COUNT(*) AS c FROM files").get() as { c: number };
  const chunkCount = db.prepare("SELECT COUNT(*) AS c FROM chunks").get() as { c: number };
  const latest = db.prepare("SELECT MAX(indexed_at) AS latest FROM files").get() as { latest: string | null };

  let embeddedChunks = 0;
  if (model) {
    const row = db
      .prepare("SELECT COUNT(*) AS c FROM embeddings WHERE model = ?")
      .get(model) as { c: number };
    embeddedChunks = row.c;
  } else {
    const row = db
      .prepare("SELECT COUNT(DISTINCT chunk_id) AS c FROM embeddings")
      .get() as { c: number };
    embeddedChunks = row.c;
  }

  const needsEmbedding = Math.max(0, chunkCount.c - embeddedChunks);

  return {
    rootPath: paths.rootPath,
    tinPath: paths.tinPath,
    dbPath: paths.dbPath,
    indexedFiles: fileCount.c,
    indexedChunks: chunkCount.c,
    embeddedChunks,
    lastIndexedAt: latest.latest,
    needsEmbedding
  };
}

export function closeDatabase(db: DatabaseSync): void {
  db.close();
}

function withTransaction(db: DatabaseSync, fn: () => void): void {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function tokenizeQuery(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 1);
}

function sanitizeTerm(term: string): string {
  return term.replace(/[^\p{L}\p{N}_']/gu, "").toLowerCase();
}

function buildFtsQuery(query: string): string | null {
  const terms = tokenizeQuery(query)
    .map(sanitizeTerm)
    .filter((t) => t.length > 0);
  if (terms.length === 0) {
    return null;
  }
  if (terms.length === 1) {
    return `"${terms[0]}"*`;
  }
  return terms.map((t) => `"${t}"*`).join(" AND ");
}

function normalizeBm25(bm25Score: number): number {
  const abs = Math.abs(bm25Score);
  return abs / (1 + abs);
}

function findBestLineOffset(content: string, terms: string[]): number {
  if (terms.length === 0) {
    return 0;
  }

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.toLowerCase() ?? "";
    if (terms.some((term) => line.includes(term))) {
      return i;
    }
  }
  return 0;
}

function makeSnippet(content: string, lineOffset: number): string {
  const lines = content.split(/\r?\n/);
  const start = Math.max(0, lineOffset - 2);
  const end = Math.min(lines.length, lineOffset + 3);
  const body = lines.slice(start, end).join("\n").trim();

  if (body.length <= 360) {
    return body;
  }
  return `${body.slice(0, 357)}...`;
}

function parseVector(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  } catch {
    return [];
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
