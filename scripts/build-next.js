#!/usr/bin/env node
const { spawnSync } = require("child_process");
const { cpSync, existsSync, rmSync } = require("fs");
const { join } = require("path");

// Build-stage heap only — the deployed container keeps its own smaller cap
// (NODE_OPTIONS in the Dockerfile's runner stage). At 1024 the "Running
// TypeScript" step now dies with "Ineffective mark-compacts near heap limit";
// the project outgrew that ceiling.
const nodeOptions = [process.env.NODE_OPTIONS, "--max-old-space-size=2048"]
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

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const root = process.cwd();
const standaloneDir = join(root, ".next", "standalone");

if (existsSync(standaloneDir)) {
  const staticTarget = join(standaloneDir, ".next", "static");
  rmSync(staticTarget, { recursive: true, force: true });
  cpSync(join(root, ".next", "static"), staticTarget, { recursive: true });

  const publicDir = join(root, "public");
  if (existsSync(publicDir)) {
    const publicTarget = join(standaloneDir, "public");
    rmSync(publicTarget, { recursive: true, force: true });
    cpSync(publicDir, publicTarget, { recursive: true });
  }
}

process.exit(0);
