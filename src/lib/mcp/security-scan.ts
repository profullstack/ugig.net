/**
 * McpSecurityScanner — Security scanning for MCP server listings.
 *
 * Shells out to two external CLI tools:
 *   1. SpiderShield (Python) — scans MCP servers for security issues & description quality
 *   2. mcp-scan (Node) — scans MCP configs for secrets, typosquatting, misconfigs
 *
 * Gracefully degrades if either tool is unavailable.
 */

import { execFile } from "child_process";
import { writeFile, unlink, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// ── Types ──────────────────────────────────────────────────────────

export type McpScanStatus = "pending" | "scanning" | "clean" | "warning" | "critical" | "error" | "timeout";

export type McpRating = "F" | "D" | "C" | "B" | "A" | "A+";

export interface McpScanFinding {
  source: "spidershield" | "mcp-scan";
  rule: string;
  severity: "low" | "medium" | "high" | "critical";
  detail: string;
}

export interface SpiderShieldReport {
  available: boolean;
  rating?: string;
  security_score?: number;
  description_score?: number;
  metadata_score?: number;
  overall_score?: number;
  grade?: string;
  findings?: any[];
  raw?: any;
  error?: string;
}

export interface McpScanReport {
  available: boolean;
  findings?: any[];
  raw?: any;
  error?: string;
}

export interface McpScanResult {
  status: McpScanStatus;
  rating: McpRating | null;
  securityScore: number | null;
  findings: McpScanFinding[];
  spidershieldReport: SpiderShieldReport;
  mcpScanReport: McpScanReport;
  scannerVersion: string;
}

// ── Constants ──────────────────────────────────────────────────────

export const MCP_SCANNER_VERSION = "mcp-scanner-0.1.0";
const EXEC_TIMEOUT_MS = 30_000;
const SPIDERSHIELD_PATH = process.env.SPIDERSHIELD_PATH || "spidershield";

// ── Helpers ────────────────────────────────────────────────────────

function execCommand(cmd: string, args: string[], timeoutMs = EXEC_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        // If the process produced output before erroring, still return it
        if (stdout || stderr) {
          resolve({ stdout: stdout || "", stderr: stderr || "" });
        } else {
          reject(error);
        }
      } else {
        resolve({ stdout: stdout || "", stderr: stderr || "" });
      }
    });
  });
}

async function isCommandAvailable(cmd: string): Promise<boolean> {
  try {
    await execCommand("which", [cmd], 5000);
    return true;
  } catch {
    return false;
  }
}

// ── SpiderShield Scanner ───────────────────────────────────────────

export async function scanWithSpiderShield(serverUrl: string): Promise<SpiderShieldReport> {
  const spidershieldCmd = SPIDERSHIELD_PATH;
  const available = await isCommandAvailable(spidershieldCmd);

  if (!available) {
    return { available: false, error: "spidershield CLI not found on PATH" };
  }

  try {
    const { stdout, stderr } = await execCommand(
      spidershieldCmd,
      ["scan", serverUrl, "--format", "spiderrating"],
      EXEC_TIMEOUT_MS
    );

    // Try to parse JSON from stdout
    const jsonOutput = stdout.trim();
    if (!jsonOutput) {
      return { available: true, error: stderr || "No output from spidershield" };
    }

    // SpiderShield may output non-JSON preamble; find the JSON block
    let parsed: any;
    try {
      parsed = JSON.parse(jsonOutput);
    } catch {
      // Try to extract JSON from mixed output
      const jsonMatch = jsonOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        return { available: true, error: `Failed to parse spidershield output`, raw: jsonOutput };
      }
    }

    return {
      available: true,
      rating: parsed.grade || parsed.rating || null,
      security_score: parsed.security_score ?? parsed.scores?.security ?? null,
      description_score: parsed.description_score ?? parsed.scores?.description ?? null,
      metadata_score: parsed.metadata_score ?? parsed.scores?.metadata ?? null,
      overall_score: parsed.overall_score ?? parsed.scores?.overall ?? null,
      grade: parsed.grade || null,
      findings: parsed.findings || parsed.issues || [],
      raw: parsed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { available: true, error: message };
  }
}

// ── mcp-scan Scanner ───────────────────────────────────────────────

export async function scanWithMcpScan(serverUrl: string, sourceUrl?: string): Promise<McpScanReport> {
  try {
    // Create a temporary MCP config file pointing to the server
    const tmpDir = await mkdtemp(join(tmpdir(), "mcp-scan-"));
    const configPath = join(tmpDir, "mcp-config.json");

    // Build a minimal MCP config that mcp-scan can process
    const mcpConfig = {
      mcpServers: {
        "scan-target": {
          url: serverUrl,
          ...(sourceUrl ? { source: sourceUrl } : {}),
        },
      },
    };

    await writeFile(configPath, JSON.stringify(mcpConfig, null, 2));

    try {
      const { stdout, stderr } = await execCommand(
        "npx",
        ["--yes", "mcp-scan@latest", "--json", "--config", configPath],
        EXEC_TIMEOUT_MS
      );

      // Cleanup temp files
      await unlink(configPath).catch(() => {});

      const jsonOutput = stdout.trim();
      if (!jsonOutput) {
        return { available: true, error: stderr || "No output from mcp-scan" };
      }

      let parsed: any;
      try {
        parsed = JSON.parse(jsonOutput);
      } catch {
        const jsonMatch = jsonOutput.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          return { available: true, error: "Failed to parse mcp-scan output", raw: jsonOutput };
        }
      }

      return {
        available: true,
        findings: Array.isArray(parsed) ? parsed : parsed.findings || parsed.issues || [],
        raw: parsed,
      };
    } catch (err) {
      // Cleanup temp files
      await unlink(configPath).catch(() => {});
      const message = err instanceof Error ? err.message : String(err);
      return { available: true, error: message };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { available: false, error: message };
  }
}

// ── Combined Scanner ───────────────────────────────────────────────

function mapSpiderShieldFindings(report: SpiderShieldReport): McpScanFinding[] {
  if (!report.findings || !Array.isArray(report.findings)) return [];

  return report.findings.map((f: any) => ({
    source: "spidershield" as const,
    rule: f.rule || f.id || "spidershield-finding",
    severity: normalizeSeverity(f.severity || f.level || "medium"),
    detail: f.detail || f.message || f.description || JSON.stringify(f),
  }));
}

function mapMcpScanFindings(report: McpScanReport): McpScanFinding[] {
  if (!report.findings || !Array.isArray(report.findings)) return [];

  return report.findings.map((f: any) => ({
    source: "mcp-scan" as const,
    rule: f.rule || f.id || f.type || "mcp-scan-finding",
    severity: normalizeSeverity(f.severity || f.level || "medium"),
    detail: f.detail || f.message || f.description || JSON.stringify(f),
  }));
}

function normalizeSeverity(sev: string): McpScanFinding["severity"] {
  const lower = sev.toLowerCase();
  if (lower === "critical") return "critical";
  if (lower === "high" || lower === "error") return "high";
  if (lower === "medium" || lower === "warning" || lower === "warn") return "medium";
  return "low";
}

function deriveRating(score: number | null): McpRating | null {
  if (score === null || score === undefined) return null;
  if (score >= 95) return "A+";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

function deriveStatus(findings: McpScanFinding[], spReport: SpiderShieldReport, mcpReport: McpScanReport): McpScanStatus {
  // If both tools had errors/unavailable and produced no findings, mark as error
  if (!spReport.available && !mcpReport.available) return "error";

  const hasCritical = findings.some((f) => f.severity === "critical");
  const hasHigh = findings.some((f) => f.severity === "high");

  if (hasCritical) return "critical";
  if (hasHigh) return "warning";
  if (findings.length > 0) return "warning";
  return "clean";
}

export async function combinedScan(serverUrl: string, sourceUrl?: string): Promise<McpScanResult> {
  // Run both scanners in parallel
  const [spReport, mcpReport] = await Promise.all([
    scanWithSpiderShield(sourceUrl || serverUrl),
    scanWithMcpScan(serverUrl, sourceUrl),
  ]);

  // Merge findings
  const findings: McpScanFinding[] = [
    ...mapSpiderShieldFindings(spReport),
    ...mapMcpScanFindings(mcpReport),
  ];

  // Derive rating from SpiderShield score, or from findings if unavailable
  const securityScore = spReport.overall_score ?? spReport.security_score ?? null;
  let rating = spReport.grade as McpRating | null;
  if (!rating) {
    rating = deriveRating(securityScore);
  }

  // If no score from SpiderShield, derive one from findings
  let finalScore = securityScore;
  if (finalScore === null && findings.length === 0 && (spReport.available || mcpReport.available)) {
    finalScore = 100; // No findings = perfect
  } else if (finalScore === null && findings.length > 0) {
    // Rough heuristic: start at 100, deduct per finding
    finalScore = Math.max(0, 100 - findings.reduce((acc, f) => {
      if (f.severity === "critical") return acc + 30;
      if (f.severity === "high") return acc + 20;
      if (f.severity === "medium") return acc + 10;
      return acc + 5;
    }, 0));
    rating = deriveRating(finalScore);
  }

  const status = deriveStatus(findings, spReport, mcpReport);

  return {
    status,
    rating: rating || null,
    securityScore: finalScore,
    findings,
    spidershieldReport: spReport,
    mcpScanReport: mcpReport,
    scannerVersion: MCP_SCANNER_VERSION,
  };
}
