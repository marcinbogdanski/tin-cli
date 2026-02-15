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
}

export function printSearchHuman(query: string, results: SearchResult[]): void {
  if (results.length === 0) {
    process.stdout.write(`No results for: ${query}\n`);
    return;
  }

  process.stdout.write(`Results for: ${query}\n\n`);

  results.forEach((result, idx) => {
    process.stdout.write(`${idx + 1}. ${result.path}:${result.line} (score ${result.score.toFixed(3)})\n`);
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
  process.stdout.write(`Project: ${status.rootPath}\n`);
  process.stdout.write(`tin: ${status.tinPath}\n`);
  process.stdout.write(`Index: ${status.dbPath}\n`);
  process.stdout.write(`Files: ${status.indexedFiles}\n`);
  process.stdout.write(`Chunks: ${status.indexedChunks}\n`);
  process.stdout.write(`Last indexed: ${status.lastIndexedAt ?? "never"}\n`);
  process.stdout.write(`Needs embedding: ${status.needsEmbedding}\n`);
}
