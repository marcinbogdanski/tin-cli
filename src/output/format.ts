import type { IndexStats, SearchResult, StatusInfo } from "../core/types.js";

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
    const source = result.source ? `, ${result.source}` : "";
    process.stdout.write(
      `${idx + 1}. ${result.path}:${result.line} (score ${result.score.toFixed(3)}${source})\n`
    );
    if (result.snippet.trim().length > 0) {
      process.stdout.write(`${result.snippet}\n`);
    }
    process.stdout.write("\n");
  });
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
