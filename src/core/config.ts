import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { DEFAULT_EXCLUDE_GLOBS, DEFAULT_INCLUDE_GLOBS } from "./constants.js";
import type { TinConfig } from "./types.js";

const configSchema = z.object({
  include: z.array(z.string()).default(DEFAULT_INCLUDE_GLOBS),
  exclude: z.array(z.string()).default(DEFAULT_EXCLUDE_GLOBS)
});

function defaultConfig(): TinConfig {
  return {
    include: [...DEFAULT_INCLUDE_GLOBS],
    exclude: [...DEFAULT_EXCLUDE_GLOBS]
  };
}

export function writeDefaultConfig(configPath: string): boolean {
  if (existsSync(configPath)) {
    return false;
  }

  const cfg = defaultConfig();
  writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
  return true;
}

export function loadConfig(configPath: string): TinConfig {
  if (!existsSync(configPath)) {
    return defaultConfig();
  }

  const raw = readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const validated = configSchema.parse(parsed);
  return {
    include: validated.include,
    exclude: validated.exclude
  };
}
