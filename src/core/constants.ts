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

export const DEFAULT_HUMAN_MAX_RESULTS = 5;
export const DEFAULT_MACHINE_MAX_RESULTS = 20;
export const DEFAULT_MIN_SCORE = 0;
export const DEFAULT_VSEARCH_MIN_SCORE = 0.3;
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_HYBRID_CANDIDATE_LIMIT = 40;
export const DEFAULT_RRF_K = 60;
export const DEFAULT_RRF_TOP1_BONUS = 0.05;
export const DEFAULT_RRF_TOP3_BONUS = 0.02;
