#!/usr/bin/env node
const { spawnSync } = require("child_process");

const nodeOptions = [process.env.NODE_OPTIONS, "--max-old-space-size=1024"]
  .filter(Boolean)
  .join(" ");

const result = spawnSync("next", ["build"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
