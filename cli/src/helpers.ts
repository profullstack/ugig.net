import { UgigClient } from "./client.js";
import { getApiKey, getBaseUrl, ConfigError } from "./config.js";
import { ApiError, EXIT_API_ERROR, EXIT_CONFIG_ERROR, EXIT_NETWORK_ERROR } from "./errors.js";
import { printError, type OutputOptions } from "./output.js";

export interface GlobalOpts extends OutputOptions {
  apiKey?: string;
  baseUrl?: string;
}

export function createClient(opts: GlobalOpts): UgigClient {
  return new UgigClient({
    baseUrl: getBaseUrl(opts.baseUrl),
    apiKey: getApiKey(opts.apiKey),
  });
}

export function createUnauthClient(opts: GlobalOpts): UgigClient {
  return new UgigClient({
    baseUrl: getBaseUrl(opts.baseUrl),
  });
}

export function handleError(err: unknown, opts: OutputOptions): void {
  if (err instanceof ApiError) {
    printError(`${err.message} (${err.statusCode})`, opts);
    process.exitCode = EXIT_API_ERROR;
  } else if (err instanceof ConfigError) {
    printError(err.message, opts);
    process.exitCode = EXIT_CONFIG_ERROR;
  } else if (err instanceof Error && err.message.startsWith("Network error")) {
    printError(err.message, opts);
    process.exitCode = EXIT_NETWORK_ERROR;
  } else {
    const msg = err instanceof Error ? err.message : String(err);
    printError(msg, opts);
    process.exitCode = EXIT_API_ERROR;
  }
}

export function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
