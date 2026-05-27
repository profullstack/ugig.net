import { spawnSync } from "node:child_process";

function quoteCmdArg(value) {
  if (/^[A-Za-z0-9_./:@=+-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/(["^&|<>])/g, "^$1")}"`;
}

function spawn(command, args, options) {
  if (process.platform === "win32") {
    const commandLine = [command, ...args].map(quoteCmdArg).join(" ");
    return spawnSync("cmd.exe", ["/d", "/s", "/c", commandLine], options);
  }

  return spawnSync(command, args, options);
}

function runBestEffort(command, args, description) {
  const result = spawn(command, args, {
    stdio: "inherit",
    windowsHide: true,
  });

  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? `exit code ${result.status}`;
    console.warn(`[postinstall] Skipping ${description}: ${detail}`);
    return false;
  }

  return true;
}

runBestEffort(
  "pnpm",
  ["dlx", "@socketsecurity/socket-patch", "apply", "--silent", "--ecosystems", "npm"],
  "Socket package patching"
);

const insideGitRepo = spawn("git", ["rev-parse", "--is-inside-work-tree"], {
  stdio: "ignore",
  windowsHide: true,
});

if (!insideGitRepo.error && insideGitRepo.status === 0) {
  runBestEffort("git", ["config", "core.hooksPath", "hooks"], "Git hooks setup");
}
