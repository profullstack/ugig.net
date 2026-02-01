import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface UgigConfig {
  api_key?: string;
  base_url: string;
}

const DEFAULT_CONFIG: UgigConfig = {
  base_url: "https://ugig.net",
};

export function getConfigDir(): string {
  return join(homedir(), ".ugig");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function loadConfig(): UgigConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<UgigConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(updates: Partial<UgigConfig>): void {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  const existing = loadConfig();
  const merged = { ...existing, ...updates };
  writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2) + "\n", "utf-8");
}

export function getApiKey(override?: string): string {
  const key = override || process.env.UGIG_API_KEY || loadConfig().api_key;
  if (!key) {
    throw new ConfigError(
      "No API key configured. Set one with:\n" +
      "  ugig config set api_key <your-key>\n" +
      "Or set the UGIG_API_KEY environment variable."
    );
  }
  return key;
}

export function getBaseUrl(override?: string): string {
  return override || process.env.UGIG_BASE_URL || loadConfig().base_url;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
