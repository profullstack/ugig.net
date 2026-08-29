"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugifyTeamName } from "@/lib/teams";

export function CreateTeamForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const slug = slugifyTeamName(name);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          billable_rate_usd: rate.trim() === "" ? 0 : Number(rate),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Could not create the team");
        return;
      }
      setName("");
      setDescription("");
      setRate("");
      router.push(`/teams/${payload.data.slug}`);
    } catch {
      setError("Could not create the team");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-6 bg-card rounded-lg border border-border shadow-sm space-y-4"
    >
      <div>
        <h2 className="text-lg font-semibold">New team</h2>
        <p className="text-sm text-muted-foreground">
          You become the owner and can add members right away.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="team-name">Name</Label>
        <Input
          id="team-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Profullstack"
          maxLength={100}
          required
        />
        {slug && <p className="text-xs text-muted-foreground">ugig.net/teams/{slug}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="team-description">Description</Label>
        <Textarea
          id="team-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this team does"
          maxLength={500}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="team-rate">Billable rate (USD / hour)</Label>
        <Input
          id="team-rate"
          type="number"
          min={0}
          step="0.01"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="150"
        />
        <p className="text-xs text-muted-foreground">
          The default for everyone on the team. Members and projects can override it.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={submitting || name.trim().length < 2} className="w-full">
        {submitting ? "Creating…" : "Create team"}
      </Button>
    </form>
  );
}
