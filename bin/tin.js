#!/usr/bin/env node
import('../dist/src/cli/main.js').then((m) => m.run()).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
