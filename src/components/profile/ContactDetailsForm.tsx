"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ProfileFields } from "@profullstack/profile/react";
import type { ProfileField } from "@profullstack/profile";
import { Button } from "@/components/ui/button";

type Values = Partial<Record<ProfileField, string | null>>;
const FIELDS: ProfileField[] = [
  "email",
  "first_name",
  "last_name",
  "company_domain",
  "job_title",
  "linkedin_url",
];

/**
 * The shared @profullstack/profile fields, read and written through
 * /api/v1/me/profile. Private: not shown on the public profile.
 */
export function ContactDetailsForm() {
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/me/profile", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return;
        const p = body?.profile ?? {};
        setValues(Object.fromEntries(FIELDS.map((k) => [k, p[k] ?? ""])));
      })
      .catch(() => !cancelled && setMessage({ ok: false, text: "Couldn't load your details" }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setErrors({});
    try {
      const res = await fetch("/api/v1/me/profile", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(body.errors ?? {});
        setMessage({ ok: false, text: body.error || "Couldn't save" });
        return;
      }
      const p = body.profile ?? {};
      setValues(Object.fromEntries(FIELDS.map((k) => [k, p[k] ?? ""])));
      setMessage({ ok: true, text: "Saved." });
    } catch {
      setMessage({ ok: false, text: "Couldn't save" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="border border-border rounded-lg p-6 bg-card space-y-4" id="contact-details">
      <div>
        <h2 className="font-semibold">Contact details</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your name, work details and LinkedIn. Private: not shown on your public profile.
        </p>
      </div>
      <ProfileFields
        idPrefix="contact-"
        values={values}
        onChange={setValues}
        errors={errors}
        disabled={loading || busy}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading || busy}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save details
        </Button>
        {message && (
          <span className={message.ok ? "text-sm text-primary" : "text-sm text-destructive"}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
