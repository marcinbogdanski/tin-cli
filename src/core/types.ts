export type TinConfig = {
  include: string[];
  exclude: string[];
};

export type IndexStats = {
  scanned: number;
  added: number;
  updated: number;
  skipped: number;
  removed: number;
  errors: number;
};

export type SearchResult = {
  path: string;
  line: number;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
};

export type StatusInfo = {
  rootPath: string;
  tinPath: string;
  dbPath: string;
  indexedFiles: number;
  indexedChunks: number;
  lastIndexedAt: string | null;
  needsEmbedding: number;
};
