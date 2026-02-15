import { createColors } from "picocolors";
import type { IndexStats, SearchResult, StatusInfo } from "../core/types.js";

const colors = createColors(resolveColorEnabled());
const HIGHLIGHT_START = "\u001b[33m";
const HIGHLIGHT_END = "\u001b[0m";

export function getHumanHighlightMarkers(): { pre: string; post: string } {
  if (!resolveColorEnabled()) {
    return { pre: "", post: "" };
  }
  return { pre: HIGHLIGHT_START, post: HIGHLIGHT_END };
}

export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function printInitHuman(params: {
  rootPath: string;
  tinPath: string;
  createdTinDir: boolean;
  createdConfig: boolean;
}): void {
  if (params.createdTinDir) {
    process.stdout.write(`Initialized tin project at ${params.rootPath}\n`);
  } else {
    process.stdout.write(`tin project already exists at ${params.rootPath}\n`);
  }

  if (params.createdConfig) {
    process.stdout.write(`Created ${params.tinPath}/config.json\n`);
  }
}

export function printIndexHuman(stats: IndexStats): void {
  process.stdout.write(
    `Indexed ${stats.scanned} files: ${stats.added} added, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.removed} removed` +
      (stats.errors > 0 ? `, ${stats.errors} errors` : "") +
      "\n"
  );

  if (stats.embeddingModel) {
    process.stdout.write(`Embeddings: ${stats.embedded} chunks embedded (${stats.embeddingModel})\n`);
  }
}

export function printSearchHuman(query: string, results: SearchResult[]): void {
  if (results.length === 0) {
    process.stdout.write(`No results for: ${query}\n`);
    return;
  }

  process.stdout.write(`Results for: ${query}\n\n`);

  results.forEach((result, idx) => {
    const chunkLabel = `, chunk: ${result.chunkNumber}/${result.chunkCount}`;
    const scoreInfo = formatScoreInfo(result);
    const header = `=== ${idx + 1}. ${result.path} (line: ${result.line}${chunkLabel}, ${scoreInfo}) ===`;
    process.stdout.write(`${colors.blue(header)}\n`);
    if (result.snippet.trim().length > 0) {
      process.stdout.write(`${result.snippet}\n`);
    }
    process.stdout.write("\n");
  });
}

function formatScoreInfo(result: SearchResult): string {
  if (result.source === "hybrid") {
    const vectorScore = (result.vectorScore ?? 0).toFixed(3);
    const bm25Score = (result.bm25Score ?? 0).toFixed(3);
    return `hybrid: ${result.score.toFixed(3)}, vector: ${vectorScore}, bm25: ${bm25Score}`;
  }
  if (result.source === "vector") {
    return `vscore: ${result.score.toFixed(3)}`;
  }
  if (result.source === "bm25") {
    return `bm25: ${result.score.toFixed(3)}`;
  }
  return `score: ${result.score.toFixed(3)}`;
}

export function printRefreshSummaryHuman(params: { stats: IndexStats; status: StatusInfo }): void {
  const { stats, status } = params;
  const refreshedFiles = stats.added + stats.updated;

  process.stdout.write(
    `Refresh before search: Files indexed ${status.indexedFiles}/${stats.scanned}, Chunks embedded ${status.embeddedChunks}/${status.indexedChunks}\n`
  );
  process.stdout.write(
    `This refresh: files indexed ${refreshedFiles} (${stats.added} new, ${stats.updated} updated, ${stats.removed} removed), chunks embedded ${stats.embedded}\n`
  );
  if (stats.errors > 0) {
    process.stdout.write(`Refresh warnings: ${stats.errors} file errors\n`);
  }
  process.stdout.write("\n");
}

export function printFiles(results: SearchResult[]): void {
  const uniquePaths = Array.from(new Set(results.map((r) => r.path)));
  process.stdout.write(`${uniquePaths.join("\n")}\n`);
}

export function printStatusHuman(status: StatusInfo): void {
  process.stdout.write(`Project path: ${status.rootPath}\n`);
  process.stdout.write(`Tin path: ${status.tinPath}\n`);
  process.stdout.write(`Index path: ${status.dbPath}\n`);
  process.stdout.write(`Indexed files: ${status.indexedFiles}\n`);
  process.stdout.write(`Indexed chunks: ${status.indexedChunks}\n`);
  process.stdout.write(`Indexed time: ${status.lastIndexedAt ?? "never"}\n`);

  const embeddingProviderName = status.embeddingProviderName ?? "openai";
  const embeddingProviderSource = status.embeddingProviderSource ?? "default";
  const embeddingApiUrl = status.embeddingApiUrl ?? "https://api.openai.com/v1";
  const embeddingApiUrlSource = status.embeddingApiUrlSource ?? "default";
  const embeddingModelName = status.embeddingModelName ?? "text-embedding-3-small";
  const embeddingModelSource = status.embeddingModelSource ?? "default";
  const embeddingApiKeyPreview = status.embeddingApiKeyPreview ?? "unset";
  const embeddingApiKeySource = status.embeddingApiKeySource ?? "unset";

  process.stdout.write(`Embedding provider: ${embeddingProviderName} (${embeddingProviderSource})\n`);
  process.stdout.write(`Embedding API URL: ${embeddingApiUrl} (${embeddingApiUrlSource})\n`);
  process.stdout.write(`Embedding model name: ${embeddingModelName} (${embeddingModelSource})\n`);
  process.stdout.write(`Embedding API key: ${embeddingApiKeyPreview} (${embeddingApiKeySource})\n`);
  process.stdout.write(`Embedded chunks: ${status.embeddedChunks} / ${status.indexedChunks}\n`);
}

function resolveColorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined) {
    return false;
  }

  const forceColor = process.env.FORCE_COLOR?.trim();
  if (forceColor === "0") {
    return false;
  }
  if (forceColor && forceColor !== "0") {
    return true;
  }

  return Boolean(process.stdout.isTTY);
}
