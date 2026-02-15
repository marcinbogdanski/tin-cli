import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CONFIG_FILE_NAME, DB_FILE_NAME, TIN_DIR_NAME } from "./constants.js";
import { writeDefaultConfig } from "./config.js";
import { TinError } from "./errors.js";

export type ProjectPaths = {
  rootPath: string;
  tinPath: string;
  configPath: string;
  dbPath: string;
};

export function getProjectPaths(rootPath: string): ProjectPaths {
  const tinPath = join(rootPath, TIN_DIR_NAME);
  return {
    rootPath,
    tinPath,
    configPath: join(tinPath, CONFIG_FILE_NAME),
    dbPath: join(tinPath, DB_FILE_NAME)
  };
}

export function findProjectRoot(startDir: string = process.cwd()): string | null {
  let current = resolve(startDir);

  while (true) {
    const marker = join(current, TIN_DIR_NAME);
    if (existsSync(marker)) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function requireProject(startDir: string = process.cwd()): ProjectPaths {
  const rootPath = findProjectRoot(startDir);
  if (!rootPath) {
    throw new TinError("No tin project found. Run 'tin init' in your project root.");
  }
  return getProjectPaths(rootPath);
}

export function initProject(cwd: string = process.cwd()): { project: ProjectPaths; createdTinDir: boolean; createdConfig: boolean } {
  const rootPath = resolve(cwd);
  const project = getProjectPaths(rootPath);

  let createdTinDir = false;
  if (!existsSync(project.tinPath)) {
    mkdirSync(project.tinPath, { recursive: true });
    createdTinDir = true;
  }

  const createdConfig = writeDefaultConfig(project.configPath);

  return { project, createdTinDir, createdConfig };
}
