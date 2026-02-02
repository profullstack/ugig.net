"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
  AlertTriangle,
  RefreshCw,
  Pencil,
} from "lucide-react";

const VALID_EVENTS = [
  { value: "application.new", label: "New Application" },
  { value: "message.new", label: "New Message" },
  { value: "gig.update", label: "Gig Update" },
  { value: "review.new", label: "New Review" },
] as const;

interface WebhookData {
  id: string;
  url: string;
  secret?: string;
  events: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface DeliveryData {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status_code: number | null;
  response_body: string | null;
  created_at: string;
}

interface WebhookManagerProps {
  initialWebhooks: WebhookData[];
}

export function WebhookManager({ initialWebhooks }: WebhookManagerProps) {
  const [webhooks, setWebhooks] = useState<WebhookData[]>(initialWebhooks);
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, DeliveryData[]>>(
    {}
  );
  const [loadingDeliveries, setLoadingDeliveries] = useState<string | null>(
    null
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editEvents, setEditEvents] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleEvent = (event: string, list: string[], setter: (v: string[]) => void) => {
    setter(
      list.includes(event)
        ? list.filter((e) => e !== event)
        : [...list, event]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim() || newEvents.length === 0) return;

    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl.trim(), events: newEvents }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create webhook");
        return;
      }

      setCreatedSecret(data.data.secret);
      setWebhooks((prev) => [data.data, ...prev]);
      setNewUrl("");
      setNewEvents([]);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this webhook? This action cannot be undone."
      )
    ) {
      return;
    }

    setDeletingId(id);
    setError(null);

    try {
      const res = await fetch(`/api/webhooks/${id}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete webhook");
        return;
      }

      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (webhook: WebhookData) => {
    setTogglingId(webhook.id);
    setError(null);

    try {
      const res = await fetch(`/api/webhooks/${webhook.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !webhook.active }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to update webhook");
        return;
      }

      setWebhooks((prev) =>
        prev.map((w) => (w.id === webhook.id ? { ...w, ...data.data } : w))
      );
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setTogglingId(null);
    }
  };

  const startEdit = (webhook: WebhookData) => {
    setEditingId(webhook.id);
    setEditUrl(webhook.url);
    setEditEvents([...webhook.events]);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditUrl("");
    setEditEvents([]);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editUrl.trim() || editEvents.length === 0) return;

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: editUrl.trim(), events: editEvents }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to update webhook");
        return;
      }

      setWebhooks((prev) =>
        prev.map((w) => (w.id === id ? { ...w, ...data.data } : w))
      );
      cancelEdit();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  const loadDeliveries = useCallback(
    async (webhookId: string) => {
      if (expandedId === webhookId) {
        setExpandedId(null);
        return;
      }

      setExpandedId(webhookId);
      setLoadingDeliveries(webhookId);

      try {
        const res = await fetch(
          `/api/webhooks/${webhookId}/deliveries?limit=20`
        );
        const data = await res.json();

        if (res.ok) {
          setDeliveries((prev) => ({
            ...prev,
            [webhookId]: data.data,
          }));
        }
      } catch {
        // Silently fail — deliveries are supplementary
      } finally {
        setLoadingDeliveries(null);
      }
    },
    [expandedId]
  );

  const handleCopySecret = async () => {
    if (!createdSecret) return;
    await navigator.clipboard.writeText(createdSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const statusBadge = (code: number | null) => {
    if (!code || code === 0)
      return <Badge variant="destructive">Failed</Badge>;
    if (code >= 200 && code < 300)
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">{code}</Badge>;
    return <Badge variant="destructive">{code}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Secret banner */}
      {createdSecret && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Webhook created! Copy the signing secret now — it won&apos;t be
                shown again.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <code className="text-sm bg-green-100 dark:bg-green-800/50 px-3 py-1.5 rounded font-mono break-all flex-1">
                  {createdSecret}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopySecret}
                  className="flex-shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                Use this secret to verify the{" "}
                <code className="bg-green-100 dark:bg-green-800/50 px-1 rounded">
                  X-Webhook-Signature
                </code>{" "}
                HMAC-SHA256 header on incoming payloads.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => setCreatedSecret(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Create form */}
      <div className="p-6 bg-card rounded-lg border border-border">
        <h2 className="text-lg font-semibold mb-4">Add Webhook</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            placeholder="https://your-server.com/webhook"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            type="url"
            required
          />
          <div>
            <p className="text-sm font-medium mb-2">Subscribe to events:</p>
            <div className="flex flex-wrap gap-2">
              {VALID_EVENTS.map((evt) => (
                <button
                  key={evt.value}
                  type="button"
                  onClick={() =>
                    toggleEvent(evt.value, newEvents, setNewEvents)
                  }
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    newEvents.includes(evt.value)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-border hover:bg-accent"
                  }`}
                >
                  {evt.label}
                </button>
              ))}
            </div>
          </div>
          <Button
            type="submit"
            disabled={isCreating || !newUrl.trim() || newEvents.length === 0}
          >
            <Plus className="h-4 w-4 mr-1" />
            {isCreating ? "Creating..." : "Add Webhook"}
          </Button>
        </form>
      </div>

      {/* Webhook list */}
      <div className="p-6 bg-card rounded-lg border border-border">
        <h2 className="text-lg font-semibold mb-4">
          Your Webhooks ({webhooks.length})
        </h2>

        {webhooks.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No webhooks configured. Add one above to start receiving event
            notifications.
          </p>
        ) : (
          <div className="space-y-3">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="border border-border rounded-lg overflow-hidden"
              >
                <div className="flex items-center gap-4 p-4">
                  <Globe className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    {editingId === webhook.id ? (
                      <div className="space-y-3">
                        <Input
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          type="url"
                          className="text-sm"
                        />
                        <div className="flex flex-wrap gap-2">
                          {VALID_EVENTS.map((evt) => (
                            <button
                              key={evt.value}
                              type="button"
                              onClick={() =>
                                toggleEvent(
                                  evt.value,
                                  editEvents,
                                  setEditEvents
                                )
                              }
                              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                                editEvents.includes(evt.value)
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-muted text-muted-foreground border-border hover:bg-accent"
                              }`}
                            >
                              {evt.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(webhook.id)}
                            disabled={
                              isSaving ||
                              !editUrl.trim() ||
                              editEvents.length === 0
                            }
                          >
                            {isSaving ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono truncate">
                            {webhook.url}
                          </code>
                          <Badge
                            variant={
                              webhook.active ? "default" : "secondary"
                            }
                            className="text-xs"
                          >
                            {webhook.active ? "Active" : "Paused"}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {webhook.events.map((evt) => (
                            <Badge
                              key={evt}
                              variant="outline"
                              className="text-xs"
                            >
                              {evt}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Created {formatDate(webhook.created_at)}
                        </p>
                      </>
                    )}
                  </div>
                  {editingId !== webhook.id && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(webhook)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(webhook)}
                        disabled={togglingId === webhook.id}
                        title={webhook.active ? "Pause" : "Activate"}
                        className="text-muted-foreground"
                      >
                        {togglingId === webhook.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : webhook.active ? (
                          "Pause"
                        ) : (
                          "Activate"
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(webhook.id)}
                        disabled={deletingId === webhook.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadDeliveries(webhook.id)}
                        title="Delivery history"
                      >
                        {expandedId === webhook.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Delivery log panel */}
                {expandedId === webhook.id && (
                  <div className="border-t border-border bg-muted/30 p-4">
                    <h3 className="text-sm font-medium mb-3">
                      Recent Deliveries
                    </h3>
                    {loadingDeliveries === webhook.id ? (
                      <p className="text-sm text-muted-foreground">
                        Loading...
                      </p>
                    ) : !deliveries[webhook.id] ||
                      deliveries[webhook.id].length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No deliveries yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {deliveries[webhook.id].map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center gap-3 p-3 bg-card rounded border border-border text-sm"
                          >
                            {statusBadge(d.status_code)}
                            <Badge variant="outline" className="text-xs">
                              {d.event_type}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex-1">
                              {formatDate(d.created_at)}
                            </span>
                            {d.response_body && (
                              <span
                                className="text-xs text-muted-foreground truncate max-w-[200px]"
                                title={d.response_body}
                              >
                                {d.response_body.slice(0, 80)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
