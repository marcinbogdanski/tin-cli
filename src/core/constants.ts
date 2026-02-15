export const TIN_DIR_NAME = ".tin";
export const CONFIG_FILE_NAME = "config.json";
export const DB_FILE_NAME = "index.sqlite";

export const DEFAULT_INCLUDE_GLOBS = ["**/*.md", "**/*.txt"];
export const DEFAULT_EXCLUDE_GLOBS = [
  ".tin/**",
  ".git/**",
  "node_modules/**",
  "dist/**",
  "build/**"
];

export const DEFAULT_MAX_RESULTS = 10;
export const DEFAULT_MIN_SCORE = 0;
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_HYBRID_CANDIDATE_MULTIPLIER = 4;
export const DEFAULT_HYBRID_VECTOR_WEIGHT = 0.7;
export const DEFAULT_HYBRID_TEXT_WEIGHT = 0.3;
