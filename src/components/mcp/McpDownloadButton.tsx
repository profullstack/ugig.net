"use client";

import { useState } from "react";
import { Server, Loader2, Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface McpDownloadButtonProps {
  slug: string;
}

export function McpDownloadButton({ slug }: McpDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverInfo, setServerInfo] = useState<{
    mcp_server_url: string;
    transport_type: string | null;
    supported_tools: string[];
    title: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleConnect() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/mcp/${slug}/download`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to get connection details");
        return;
      }

      setServerInfo(data);
    } catch {
      setError("Failed to get connection details");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (serverInfo) {
    return (
      <div className="space-y-3">
        <div className="p-4 bg-muted/50 border border-border rounded-lg space-y-3">
          <p className="text-sm font-medium flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            Connection Details
          </p>

          <div className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Server URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-background border border-border rounded px-2 py-1.5 break-all">
                  {serverInfo.mcp_server_url}
                </code>
                <button
                  onClick={() => copyToClipboard(serverInfo.mcp_server_url)}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors shrink-0"
                  title="Copy URL"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>

            {serverInfo.transport_type && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Transport</p>
                <code className="text-xs bg-background border border-border rounded px-2 py-1.5">
                  {serverInfo.transport_type}
                </code>
              </div>
            )}

            {serverInfo.supported_tools.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Available Tools</p>
                <div className="flex flex-wrap gap-1">
                  {serverInfo.supported_tools.map((tool) => (
                    <span
                      key={tool}
                      className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Add this server to your MCP client configuration to connect.
            </p>
          </div>
        </div>

        <a
          href={serverInfo.mcp_server_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          Open in browser <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  }

  return (
    <div>
      <Button
        onClick={handleConnect}
        disabled={loading}
        variant="outline"
        className="w-full"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Server className="h-4 w-4 mr-2" />
        )}
        Get Connection Details
      </Button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
