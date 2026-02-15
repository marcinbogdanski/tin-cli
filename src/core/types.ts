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
  embedded: number;
  embeddingModel: string | null;
};

export type SearchResult = {
  path: string;
  line: number;
  startLine: number;
  endLine: number;
  chunkNumber: number;
  chunkCount: number;
  score: number;
  vectorScore?: number;
  bm25Score?: number;
  snippet: string;
  source?: "bm25" | "vector" | "hybrid";
};

export type StatusInfo = {
  rootPath: string;
  tinPath: string;
  dbPath: string;
  indexedFiles: number;
  indexedChunks: number;
  embeddedChunks: number;
  lastIndexedAt: string | null;
  needsEmbedding: number;
  embeddingProviderName?: string;
  embeddingProviderSource?: string;
  embeddingApiUrl?: string;
  embeddingApiUrlSource?: string;
  embeddingModelName?: string;
  embeddingModelSource?: string;
  embeddingApiKeyPreview?: string;
  embeddingApiKeySource?: string;
};
