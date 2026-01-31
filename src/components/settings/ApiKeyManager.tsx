"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Key, Plus, Trash2, Copy, Check, Clock, AlertTriangle } from "lucide-react";

interface ApiKeyData {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface ApiKeyManagerProps {
  initialKeys: ApiKeyData[];
}

export function ApiKeyManager({ initialKeys }: ApiKeyManagerProps) {
  const [keys, setKeys] = useState<ApiKeyData[]>(initialKeys);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create API key");
        return;
      }

      setCreatedKey(data.key);
      setKeys((prev) => [
        {
          id: data.id,
          name: data.name,
          key_prefix: data.key_prefix,
          last_used_at: null,
          expires_at: data.expires_at,
          created_at: data.created_at,
        },
        ...prev,
      ]);
      setNewKeyName("");
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) {
      return;
    }

    setRevokingId(id);
    setError(null);

    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to revoke API key");
        return;
      }

      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatRelativeDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return formatDate(dateStr);
  };

  return (
    <div className="space-y-6">
      {/* Created key banner */}
      {createdKey && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                API key created! Copy it now — it won&apos;t be shown again.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <code className="text-sm bg-green-100 dark:bg-green-800/50 px-3 py-1.5 rounded font-mono break-all flex-1">
                  {createdKey}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="flex-shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => setCreatedKey(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Create new key form */}
      <div className="p-6 bg-card rounded-lg border border-border">
        <h2 className="text-lg font-semibold mb-4">Create New Key</h2>
        <form onSubmit={handleCreate} className="flex gap-2">
          <Input
            placeholder="Key name (e.g., Production Server)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="flex-1"
            maxLength={100}
          />
          <Button type="submit" disabled={isCreating || !newKeyName.trim()}>
            <Plus className="h-4 w-4 mr-1" />
            {isCreating ? "Creating..." : "Create Key"}
          </Button>
        </form>
      </div>

      {/* Key list */}
      <div className="p-6 bg-card rounded-lg border border-border">
        <h2 className="text-lg font-semibold mb-4">
          Active Keys ({keys.length})
        </h2>

        {keys.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No API keys yet. Create one above to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center gap-4 p-4 border border-border rounded-lg"
              >
                <Key className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{key.name}</span>
                    {key.expires_at && new Date(key.expires_at) < new Date() && (
                      <Badge variant="destructive" className="text-xs">
                        Expired
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">{key.key_prefix}...</span>
                    <span>Created {formatDate(key.created_at)}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Last used: {formatRelativeDate(key.last_used_at)}
                    </span>
                    {key.expires_at && (
                      <span>Expires {formatDate(key.expires_at)}</span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevoke(key.id)}
                  disabled={revokingId === key.id}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
