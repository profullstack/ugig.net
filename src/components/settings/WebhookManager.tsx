"use client";

import { useState, useCallback } from "react";
import { useDialog } from "@/components/providers/DialogProvider";
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
  Send,
  KeyRound,
  RotateCcw,
} from "lucide-react";

/** The events ugig emits (kept in step with WEBHOOK_EVENT_TYPES in src/lib/webhooks/hub.ts). */
const VALID_EVENTS = [
  { value: "application.new", label: "New Application" },
  { value: "message.new", label: "New Message" },
  { value: "gig.update", label: "Gig Update" },
  { value: "review.new", label: "New Review" },
] as const;

const API = "/api/v1/webhooks";

/** An endpoint as /api/v1/webhooks returns it (@profullstack/webhooks PublicEndpoint). */
export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  description: string;
  enabled: boolean;
  failures: number;
  disabled_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface DeliveryData {
  id: string;
  endpoint_id: string;
  event_type: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  next_at: string | null;
  last_status: number | null;
  last_error: string | null;
  created_at: string;
}

interface WebhookManagerProps {
  initialWebhooks: WebhookEndpoint[];
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export function WebhookManager({ initialWebhooks }: WebhookManagerProps) {
  const { confirm } = useDialog();
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>(initialWebhooks);
  const [newUrl, setNewUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [shownSecret, setShownSecret] = useState<{ id: string; secret: string; why: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, DeliveryData[]>>({});
  const [loadingDeliveries, setLoadingDeliveries] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editEvents, setEditEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const toggleEvent = (event: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(event) ? list.filter((e) => e !== event) : [...list, event]);
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setBusy(null);
    }
  };

  const replace = (endpoint: WebhookEndpoint) =>
    setWebhooks((prev) => prev.map((w) => (w.id === endpoint.id ? endpoint : w)));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim() || newEvents.length === 0) return;
    setIsCreating(true);
    await run("create", async () => {
      const { endpoint, secret } = await call<{ endpoint: WebhookEndpoint; secret: string }>("", {
        method: "POST",
        body: JSON.stringify({ url: newUrl.trim(), events: newEvents, description: newDescription.trim() }),
      });
      setShownSecret({ id: endpoint.id, secret, why: "Webhook created" });
      setWebhooks((prev) => [endpoint, ...prev]);
      setNewUrl("");
      setNewDescription("");
      setNewEvents([]);
    });
    setIsCreating(false);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm("Are you sure you want to delete this webhook? This action cannot be undone."))) return;
    await run(`delete:${id}`, async () => {
      await call(`/${id}`, { method: "DELETE" });
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      if (expandedId === id) setExpandedId(null);
      if (shownSecret?.id === id) setShownSecret(null);
    });
  };

  const handleToggle = (webhook: WebhookEndpoint) =>
    run(`toggle:${webhook.id}`, async () => {
      replace(await call<WebhookEndpoint>(`/${webhook.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !webhook.enabled }) }));
    });

  const handleTest = (webhook: WebhookEndpoint) =>
    run(`test:${webhook.id}`, async () => {
      const r = await call<{ ok: boolean; status: number | null; error: string | null }>(`/${webhook.id}/test`, { method: "POST" });
      setNotice(r.ok ? `Test delivered (HTTP ${r.status}).` : `Test failed: ${r.error || `HTTP ${r.status}`}`);
      if (expandedId === webhook.id) await refreshDeliveries(webhook.id);
    });

  const handleRotate = async (webhook: WebhookEndpoint) => {
    if (!(await confirm("Rotate the signing secret? The current secret stops working immediately."))) return;
    await run(`rotate:${webhook.id}`, async () => {
      const { secret } = await call<{ secret: string }>(`/${webhook.id}/rotate`, { method: "POST" });
      setShownSecret({ id: webhook.id, secret, why: "Secret rotated" });
    });
  };

  const handleReveal = (webhook: WebhookEndpoint) =>
    run(`secret:${webhook.id}`, async () => {
      const { secret } = await call<{ secret: string }>(`/${webhook.id}/secret`);
      setShownSecret({ id: webhook.id, secret, why: "Signing secret" });
    });

  const startEdit = (webhook: WebhookEndpoint) => {
    setEditingId(webhook.id);
    setEditUrl(webhook.url);
    setEditEvents([...webhook.events]);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditUrl("");
    setEditEvents([]);
  };

  const handleSaveEdit = (id: string) =>
    run(`save:${id}`, async () => {
      if (!editUrl.trim() || editEvents.length === 0) return;
      replace(await call<WebhookEndpoint>(`/${id}`, { method: "PATCH", body: JSON.stringify({ url: editUrl.trim(), events: editEvents }) }));
      cancelEdit();
    });

  const refreshDeliveries = useCallback(async (webhookId: string) => {
    setLoadingDeliveries(webhookId);
    try {
      const { deliveries: list } = await call<{ deliveries: DeliveryData[] }>(`/${webhookId}/deliveries?limit=20`);
      setDeliveries((prev) => ({ ...prev, [webhookId]: list }));
    } catch {
      // deliveries are supplementary
    } finally {
      setLoadingDeliveries(null);
    }
  }, []);

  const toggleDeliveries = async (webhookId: string) => {
    if (expandedId === webhookId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(webhookId);
    await refreshDeliveries(webhookId);
  };

  const handleRetry = (d: DeliveryData) =>
    run(`retry:${d.id}`, async () => {
      await call(`/deliveries/${d.id}/retry`, { method: "POST" });
      setNotice("Delivery queued again.");
      await refreshDeliveries(d.endpoint_id);
    });

  const handleCopySecret = async () => {
    if (!shownSecret) return;
    await navigator.clipboard.writeText(shownSecret.secret);
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

  const statusBadge = (d: DeliveryData) => {
    if (d.status === "delivered")
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">{d.last_status ?? "OK"}</Badge>;
    if (d.status === "pending")
      return <Badge variant="secondary">{d.attempts ? `Retrying (${d.last_status ?? "error"})` : "Queued"}</Badge>;
    return <Badge variant="destructive">{d.last_status ?? "Failed"}</Badge>;
  };

  const eventChip = (active: boolean, small = false) =>
    `${small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} rounded-full border transition-colors ${
      active ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:bg-accent"
    }`;

  return (
    <div className="space-y-6">
      {shownSecret && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                {shownSecret.why}. Copy the signing secret now and keep it in your secret store.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <code className="text-sm bg-green-100 dark:bg-green-800/50 px-3 py-1.5 rounded font-mono break-all flex-1">
                  {shownSecret.secret}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopySecret} className="flex-shrink-0">
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                Verify the Standard Webhooks{" "}
                <code className="bg-green-100 dark:bg-green-800/50 px-1 rounded">webhook-signature</code> header with any
                Standard Webhooks library, or the{" "}
                <code className="bg-green-100 dark:bg-green-800/50 px-1 rounded">X-Webhook-Signature</code> header (hex
                HMAC-SHA256 of the raw body, keyed with this secret exactly as shown).
              </p>
              <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setShownSecret(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3 bg-muted border border-border rounded-lg text-sm" role="status">
          {notice}
        </div>
      )}

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
          <Input
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            maxLength={200}
          />
          <div>
            <p className="text-sm font-medium mb-2">Subscribe to events:</p>
            <div className="flex flex-wrap gap-2">
              {VALID_EVENTS.map((evt) => (
                <button
                  key={evt.value}
                  type="button"
                  onClick={() => toggleEvent(evt.value, newEvents, setNewEvents)}
                  className={eventChip(newEvents.includes(evt.value))}
                >
                  {evt.label}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={isCreating || !newUrl.trim() || newEvents.length === 0}>
            <Plus className="h-4 w-4 mr-1" />
            {isCreating ? "Creating..." : "Add Webhook"}
          </Button>
        </form>
      </div>

      <div className="p-6 bg-card rounded-lg border border-border">
        <h2 className="text-lg font-semibold mb-4">Your Webhooks ({webhooks.length})</h2>

        {webhooks.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No webhooks configured. Add one above to start receiving event notifications.
          </p>
        ) : (
          <div className="space-y-3">
            {webhooks.map((webhook) => (
              <div key={webhook.id} className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center gap-4 p-4">
                  <Globe className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    {editingId === webhook.id ? (
                      <div className="space-y-3">
                        <Input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} type="url" className="text-sm" />
                        <div className="flex flex-wrap gap-2">
                          {VALID_EVENTS.map((evt) => (
                            <button
                              key={evt.value}
                              type="button"
                              onClick={() => toggleEvent(evt.value, editEvents, setEditEvents)}
                              className={eventChip(editEvents.includes(evt.value), true)}
                            >
                              {evt.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(webhook.id)}
                            disabled={busy === `save:${webhook.id}` || !editUrl.trim() || editEvents.length === 0}
                          >
                            {busy === `save:${webhook.id}` ? "Saving..." : "Save"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono truncate">{webhook.url}</code>
                          <Badge variant={webhook.enabled ? "default" : "secondary"} className="text-xs">
                            {webhook.enabled ? "Active" : "Paused"}
                          </Badge>
                        </div>
                        {webhook.description && <p className="text-sm text-muted-foreground mt-1">{webhook.description}</p>}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {webhook.events.map((evt) => (
                            <Badge key={evt} variant="outline" className="text-xs">
                              {evt}
                            </Badge>
                          ))}
                        </div>
                        {webhook.disabled_reason && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">Switched off: {webhook.disabled_reason}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Created {formatDate(webhook.created_at)}
                          {webhook.failures > 0 && ` · ${webhook.failures} failed in a row`}
                        </p>
                      </>
                    )}
                  </div>
                  {editingId !== webhook.id && (
                    <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                      <Button variant="ghost" size="sm" onClick={() => handleTest(webhook)} disabled={busy === `test:${webhook.id}`} title="Send a test event">
                        {busy === `test:${webhook.id}` ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleReveal(webhook)} disabled={busy === `secret:${webhook.id}`} title="Show signing secret">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleRotate(webhook)} disabled={busy === `rotate:${webhook.id}`} title="Rotate signing secret">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(webhook)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggle(webhook)}
                        disabled={busy === `toggle:${webhook.id}`}
                        title={webhook.enabled ? "Pause" : "Activate"}
                        className="text-muted-foreground"
                      >
                        {busy === `toggle:${webhook.id}` ? <RefreshCw className="h-4 w-4 animate-spin" /> : webhook.enabled ? "Pause" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(webhook.id)}
                        disabled={busy === `delete:${webhook.id}`}
                        title="Delete"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleDeliveries(webhook.id)} title="Delivery history">
                        {expandedId === webhook.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                </div>

                {expandedId === webhook.id && (
                  <div className="border-t border-border bg-muted/30 p-4">
                    <h3 className="text-sm font-medium mb-3">Recent Deliveries</h3>
                    {loadingDeliveries === webhook.id && !deliveries[webhook.id] ? (
                      <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : !deliveries[webhook.id] || deliveries[webhook.id].length === 0 ? (
                      <p className="text-sm text-muted-foreground">No deliveries yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {deliveries[webhook.id].map((d) => (
                          <div key={d.id} className="flex items-center gap-3 p-3 bg-card rounded border border-border text-sm">
                            {statusBadge(d)}
                            <Badge variant="outline" className="text-xs">
                              {d.event_type}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex-1">
                              {formatDate(d.created_at)}
                              {d.attempts > 1 && ` · ${d.attempts} attempts`}
                            </span>
                            {d.last_error && (
                              <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={d.last_error}>
                                {d.last_error.slice(0, 80)}
                              </span>
                            )}
                            {d.status !== "delivered" && (
                              <Button variant="ghost" size="sm" onClick={() => handleRetry(d)} disabled={busy === `retry:${d.id}`} title="Send again">
                                <RefreshCw className={`h-4 w-4 ${busy === `retry:${d.id}` ? "animate-spin" : ""}`} />
                              </Button>
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
