import { Command, InvalidArgumentError } from "commander";
import { DEFAULT_MAX_RESULTS, DEFAULT_MIN_SCORE } from "../core/constants.js";
import { loadConfig } from "../core/config.js";
import { TinError } from "../core/errors.js";
import { indexProject } from "../core/indexer.js";
import { initProject, requireProject } from "../core/project.js";
import type { ProjectPaths } from "../core/project.js";
import { queryProject } from "../core/query.js";
import { searchProject } from "../core/search.js";
import { getProjectStatus } from "../core/status.js";
import { vectorSearchProject } from "../core/vector-search.js";
import {
  printFiles,
  printIndexHuman,
  printInitHuman,
  printJson,
  printRefreshSummaryHuman,
  printSearchHuman,
  printStatusHuman
} from "../output/format.js";
import type { IndexStats, StatusInfo } from "../core/types.js";

const VERSION = "0.1.0";

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`Expected a positive integer, got '${value}'`);
  }
  return parsed;
}

function parseNonNegativeFloat(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new InvalidArgumentError(`Expected a non-negative number, got '${value}'`);
  }
  return parsed;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = new Command();

  program.name("tin").description("Local CLI search for project documents").version(VERSION);

  program
    .command("init")
    .description("Initialize a tin project in the current directory")
    .option("--json", "Output JSON")
    .action((opts: { json?: boolean }) => {
      const result = initProject(process.cwd());
      if (opts.json) {
        printJson(result);
        return;
      }
      printInitHuman({
        rootPath: result.project.rootPath,
        tinPath: result.project.tinPath,
        createdTinDir: result.createdTinDir,
        createdConfig: result.createdConfig
      });
    });

  program
    .command("index")
    .description("Index project files (always runs embedding pass when configured)")
    .option("--json", "Output JSON")
    .action(async (opts: { json?: boolean }) => {
      const project = requireProject(process.cwd());
      const config = loadConfig(project.configPath);
      const stats = await indexProject(project, config, {
        embed: true
      });

      if (opts.json) {
        printJson(stats);
        return;
      }
      printIndexHuman(stats);
    });

  program
    .command("search")
    .description("Keyword search using BM25")
    .argument("<query>", "Search query")
    .option("--json", "Output JSON")
    .option("--files", "Output file paths only")
    .option("-n, --max-results <n>", "Max results", parsePositiveInt, DEFAULT_MAX_RESULTS)
    .option("--min-score <score>", "Minimum score", parseNonNegativeFloat, DEFAULT_MIN_SCORE)
    .action(
      async (
        query: string,
        opts: { json?: boolean; files?: boolean; maxResults: number; minScore: number }
      ) => {
        if (opts.json && opts.files) {
          throw new TinError("Choose one output mode: --json or --files", 2);
        }

        const project = requireProject(process.cwd());
        const refresh = await refreshBeforeSearch(project);
        if (!opts.json && !opts.files) {
          printRefreshSummaryHuman(refresh);
        }
        const results = searchProject(project, query, {
          limit: opts.maxResults,
          minScore: opts.minScore
        });

        if (opts.json) {
          printJson(results);
          return;
        }
        if (opts.files) {
          printFiles(results);
          return;
        }
        printSearchHuman(query, results);
      }
    );

  program
    .command("vsearch")
    .description("Vector/semantic search")
    .argument("<query>", "Search query")
    .option("--json", "Output JSON")
    .option("--files", "Output file paths only")
    .option("-n, --max-results <n>", "Max results", parsePositiveInt, DEFAULT_MAX_RESULTS)
    .option("--min-score <score>", "Minimum score", parseNonNegativeFloat, DEFAULT_MIN_SCORE)
    .action(
      async (
        query: string,
        opts: { json?: boolean; files?: boolean; maxResults: number; minScore: number }
      ) => {
        if (opts.json && opts.files) {
          throw new TinError("Choose one output mode: --json or --files", 2);
        }

        const project = requireProject(process.cwd());
        const refresh = await refreshBeforeSearch(project);
        if (!opts.json && !opts.files) {
          printRefreshSummaryHuman(refresh);
        }
        const results = await vectorSearchProject(project, query, {
          limit: opts.maxResults,
          minScore: opts.minScore,
          fullChunk: true
        });

        if (opts.json) {
          printJson(results);
          return;
        }
        if (opts.files) {
          printFiles(results);
          return;
        }
        printSearchHuman(query, results);
      }
    );

  program
    .command("query")
    .description("Hybrid search (BM25 + vector) with optional rerank")
    .argument("<query>", "Search query")
    .option("--json", "Output JSON")
    .option("--files", "Output file paths only")
    .option("--no-rerank", "Disable rerank even if configured")
    .option("-n, --max-results <n>", "Max results", parsePositiveInt, DEFAULT_MAX_RESULTS)
    .option("--min-score <score>", "Minimum score", parseNonNegativeFloat, DEFAULT_MIN_SCORE)
    .action(
      async (
        query: string,
        opts: {
          json?: boolean;
          files?: boolean;
          rerank?: boolean;
          maxResults: number;
          minScore: number;
        }
      ) => {
        if (opts.json && opts.files) {
          throw new TinError("Choose one output mode: --json or --files", 2);
        }

        const project = requireProject(process.cwd());
        const refresh = await refreshBeforeSearch(project);
        if (!opts.json && !opts.files) {
          printRefreshSummaryHuman(refresh);
        }
        const output = await queryProject(project, query, {
          limit: opts.maxResults,
          minScore: opts.minScore,
          useRerank: opts.rerank !== false
        });

        printWarnings(output.warnings);

        if (opts.json) {
          printJson(output.results);
          return;
        }
        if (opts.files) {
          printFiles(output.results);
          return;
        }
        printSearchHuman(query, output.results);
      }
    );

  program
    .command("status")
    .description("Show project index status")
    .option("--json", "Output JSON")
    .action((opts: { json?: boolean }) => {
      const project = requireProject(process.cwd());
      const status = getProjectStatus(project);
      if (opts.json) {
        printJson(status);
        return;
      }
      printStatusHuman(status);
    });

  try {
    await program.parseAsync(argv);
  } catch (err) {
    handleError(err);
  }
}

async function refreshBeforeSearch(
  project: ProjectPaths
): Promise<{ stats: IndexStats; status: StatusInfo }> {
  const config = loadConfig(project.configPath);
  const stats = await indexProject(project, config, {
    embed: true
  });
  const status = getProjectStatus(project);
  return { stats, status };
}

function printWarnings(warnings: string[]): void {
  if (warnings.length === 0) {
    return;
  }
  for (const warning of warnings) {
    process.stderr.write(`Warning: ${warning}\n`);
  }
}

function handleError(err: unknown): never {
  if (err instanceof TinError) {
    process.stderr.write(`${err.message}\n`);
    process.exit(err.exitCode);
  }

  if (err instanceof Error) {
    process.stderr.write(`${err.message}\n`);
  } else {
    process.stderr.write(`${String(err)}\n`);
  }

  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void run();
}
