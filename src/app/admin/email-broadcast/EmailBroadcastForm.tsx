"use client";

import { useEffect, useMemo, useState } from "react";
import { renderBroadcastHtml, renderBroadcastText } from "@/lib/markdown-email";

type PreviewMode = "rendered" | "text";

const PLACEHOLDER = `# Hello there

Write your update in **Markdown**.

- Bullet points work
- So do [links](https://ugig.net)

> And blockquotes.`;

export function EmailBroadcastForm({ baseUrl }: { baseUrl: string }) {
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("rendered");
  const [status, setStatus] = useState<
    | { type: "idle" }
    | { type: "loading" }
    | { type: "success"; sent: number; failed: number }
    | { type: "error"; message: string }
  >({ type: "idle" });

  useEffect(() => {
    fetch("/api/admin/email-broadcast")
      .then((r) => r.json())
      .then((d) => setRecipientCount(d.count ?? null))
      .catch(() => setRecipientCount(null));
  }, []);

  const previewSubject = subject.trim() || "Subject preview";

  // Rendered with the same helpers the API uses, so the preview is the email.
  const previewHtml = useMemo(
    () => renderBroadcastHtml({ subject: previewSubject, markdown, baseUrl }),
    [previewSubject, markdown, baseUrl],
  );
  const previewText = useMemo(
    () => renderBroadcastText({ subject: previewSubject, markdown, baseUrl }),
    [previewSubject, markdown, baseUrl],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !markdown.trim()) return;

    setStatus({ type: "loading" });
    try {
      const res = await fetch("/api/admin/email-broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, markdown }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: "error", message: data.error ?? "Unknown error" });
      } else {
        setStatus({ type: "success", sent: data.sent, failed: data.failed });
        setSubject("");
        setMarkdown("");
      }
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-sm text-muted-foreground">
        {recipientCount === null
          ? "Loading recipient count…"
          : `${recipientCount} recipient${recipientCount === 1 ? "" : "s"} will receive this email.`}
      </div>

      <div className="space-y-1">
        <label htmlFor="subject" className="block text-sm font-medium">
          Subject
        </label>
        <input
          id="subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          placeholder="Your email subject"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="body" className="block text-sm font-medium">
            Body <span className="text-muted-foreground">(Markdown)</span>
          </label>
          <textarea
            id="body"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            required
            rows={18}
            spellCheck
            className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            placeholder={PLACEHOLDER}
          />
          <p className="text-xs text-muted-foreground">
            Supports headings, bold, italics, links, lists, quotes, tables and
            code. A plain-text version is generated automatically for clients
            that can&apos;t show HTML.
          </p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="block text-sm font-medium">Preview</span>
            <div
              role="tablist"
              aria-label="Preview format"
              className="inline-flex rounded-md border border-input p-0.5"
            >
              {(
                [
                  ["rendered", "HTML"],
                  ["text", "Plain text"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={previewMode === mode}
                  onClick={() => setPreviewMode(mode)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    previewMode === mode
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[432px] overflow-hidden rounded-md border border-input bg-white">
            {markdown.trim() === "" ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-500">
                Start typing to preview the email.
              </div>
            ) : previewMode === "rendered" ? (
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={previewHtml}
                className="h-full w-full border-0 bg-white"
              />
            ) : (
              <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-neutral-800">
                {previewText}
              </pre>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            This is what recipients will receive.
          </p>
        </div>
      </div>

      {status.type === "success" && (
        <div className="rounded-md border border-green-500 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Sent {status.sent} email{status.sent === 1 ? "" : "s"} successfully.
          {status.failed > 0 && (
            <span className="ml-1 text-destructive">
              {status.failed} failed.
            </span>
          )}
        </div>
      )}

      {status.type === "error" && (
        <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Error: {status.message}
        </div>
      )}

      <button
        type="submit"
        disabled={status.type === "loading"}
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {status.type === "loading" ? "Sending…" : "Send broadcast"}
      </button>
    </form>
  );
}
