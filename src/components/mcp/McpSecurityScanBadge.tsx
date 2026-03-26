import { Shield, ShieldAlert, ShieldCheck, ShieldX, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface McpScanFinding {
  source: string;
  severity: string;
  detail: string;
}

interface McpSecurityScanProps {
  status: string;
  rating?: string | null;
  securityScore?: number | null;
  findingsCount: number;
  findings?: McpScanFinding[];
  scannedAt?: string | null;
  scannerVersion?: string | null;
  spidershieldAvailable?: boolean;
  mcpScanAvailable?: boolean;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Shield; colorClass: string }
> = {
  clean: {
    label: "Clean",
    variant: "default",
    icon: ShieldCheck,
    colorClass: "text-green-500",
  },
  warning: {
    label: "Warning",
    variant: "secondary",
    icon: ShieldAlert,
    colorClass: "text-amber-500",
  },
  critical: {
    label: "Critical",
    variant: "destructive",
    icon: ShieldX,
    colorClass: "text-red-500",
  },
  pending: {
    label: "Scan Pending",
    variant: "outline",
    icon: Loader2,
    colorClass: "text-muted-foreground",
  },
  scanning: {
    label: "Scanning…",
    variant: "outline",
    icon: Loader2,
    colorClass: "text-muted-foreground",
  },
  unscanned: {
    label: "Not Scanned",
    variant: "outline",
    icon: Shield,
    colorClass: "text-muted-foreground",
  },
  error: {
    label: "Scan Error",
    variant: "outline",
    icon: ShieldAlert,
    colorClass: "text-muted-foreground",
  },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-500",
  high: "text-orange-500",
  medium: "text-amber-500",
  low: "text-blue-400",
};

const RATING_COLORS: Record<string, string> = {
  "A+": "text-green-500",
  A: "text-green-500",
  B: "text-blue-500",
  C: "text-amber-500",
  D: "text-orange-500",
  F: "text-red-500",
};

export function McpSecurityScanBadge({
  status,
  rating,
  securityScore,
  findingsCount,
  findings,
  scannedAt,
  scannerVersion,
  spidershieldAvailable,
  mcpScanAvailable,
}: McpSecurityScanProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.error;
  const Icon = config.icon;
  const isSpinning = status === "pending" || status === "scanning";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon
          className={`h-4 w-4 ${config.colorClass} ${isSpinning ? "animate-spin" : ""}`}
        />
        <Badge variant={config.variant}>{config.label}</Badge>
        {rating && (
          <span className={`text-sm font-bold ${RATING_COLORS[rating] ?? ""}`}>
            {rating}
          </span>
        )}
        {securityScore !== null && securityScore !== undefined && (
          <span className="text-xs text-muted-foreground">
            Score: {securityScore}/100
          </span>
        )}
      </div>

      {/* Findings summary */}
      {findings && findings.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-0.5 ml-6">
          {findings.slice(0, 5).map((finding, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className={`font-medium capitalize ${SEVERITY_COLORS[finding.severity] ?? ""}`}>
                {finding.severity}:
              </span>
              <span>{finding.detail}</span>
              <span className="text-muted-foreground/50">({finding.source})</span>
            </li>
          ))}
          {findings.length > 5 && (
            <li className="text-muted-foreground/70">
              +{findings.length - 5} more finding{findings.length - 5 > 1 ? "s" : ""}
            </li>
          )}
        </ul>
      )}

      {/* Scan metadata */}
      <div className="text-xs text-muted-foreground/70 ml-6 space-y-0.5">
        {scannedAt && (
          <p>Scanned {new Date(scannedAt).toLocaleDateString()}</p>
        )}
        {scannerVersion && (
          <p>Scanner: {scannerVersion}</p>
        )}
        {(spidershieldAvailable !== undefined || mcpScanAvailable !== undefined) && (
          <p>
            Tools:{" "}
            {spidershieldAvailable ? "SpiderShield ✓" : "SpiderShield ✗"}
            {" · "}
            {mcpScanAvailable ? "mcp-scan ✓" : "mcp-scan ✗"}
          </p>
        )}
      </div>
    </div>
  );
}
