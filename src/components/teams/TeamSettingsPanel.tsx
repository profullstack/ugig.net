"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { teamRequest } from "./api";
import type { Team } from "./types";

type Props = {
  team: Team;
  canManage: boolean;
  isOwner: boolean;
  onChange: (team: Team) => void;
};

export function TeamSettingsPanel({ team, canManage, isOwner, onChange }: Props) {
  const router = useRouter();
  const [name, setName] = useState(team.name);
  const [slug, setSlug] = useState(team.slug);
  const [description, setDescription] = useState(team.description ?? "");
  const [rate, setRate] = useState(team.billable_rate_usd.toString());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    const { data, error: requestError } = await teamRequest<Team>(`/api/teams/${team.slug}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        billable_rate_usd: rate.trim() === "" ? 0 : Number(rate),
      }),
    });
    setBusy(false);
    if (requestError || !data) {
      setError(requestError);
      return;
    }
    onChange(data);
    setSaved(true);
    // The slug is in the URL, so a rename has to move the page with it.
    if (data.slug !== team.slug) {
      router.replace(`/teams/${data.slug}`);
    }
  }

  async function deleteTeam() {
    if (!confirm(`Delete ${team.name}? Members and projects go with it. This cannot be undone.`)) {
      return;
    }
    setError(null);
    const { error: requestError } = await teamRequest(`/api/teams/${team.slug}`, {
      method: "DELETE",
    });
    if (requestError) {
      setError(requestError);
      return;
    }
    router.push("/teams");
  }

  if (!canManage) {
    return (
      <div className="p-6 bg-card rounded-lg border border-border">
        <p className="text-sm text-muted-foreground">
          Only owners and admins can change team settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="p-6 bg-card rounded-lg border border-border space-y-4">
        <h2 className="text-lg font-semibold">Team settings</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="settings-name">Name</Label>
            <Input
              id="settings-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-slug">URL</Label>
            <Input
              id="settings-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              maxLength={60}
              required
            />
            <p className="text-xs text-muted-foreground">ugig.net/teams/{slug}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-description">Description</Label>
          <Textarea
            id="settings-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-rate">Billable rate (USD / hour)</Label>
          <Input
            id="settings-rate"
            type="number"
            min={0}
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="max-w-40"
          />
          <p className="text-xs text-muted-foreground">
            Applies to every member and project that has not set its own rate.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && !error && <p className="text-sm text-green-600">Saved.</p>}

        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </form>

      {isOwner && (
        <div className="p-6 bg-card rounded-lg border border-destructive/40 space-y-3">
          <h2 className="text-lg font-semibold">Delete team</h2>
          <p className="text-sm text-muted-foreground">
            Removes the team, its roster and its projects. This cannot be undone.
          </p>
          <Button variant="destructive" onClick={deleteTeam}>
            Delete {team.name}
          </Button>
        </div>
      )}
    </div>
  );
}
