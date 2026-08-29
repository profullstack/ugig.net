"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2, Pencil, X, Check, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TEAM_ROLES,
  formatHourlyRate,
  parseRateInput,
  resolveBillableRate,
  type TeamRole,
} from "@/lib/teams";
import { teamRequest } from "./api";
import { memberDisplayName, type Team, type TeamMember } from "./types";

type Props = {
  team: Team;
  members: TeamMember[];
  canManage: boolean;
  onChange: (members: TeamMember[]) => void;
};

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TeamMembersPanel({ team, members, canManage, onChange }: Props) {
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState<TeamRole>("member");
  const [title, setTitle] = useState("");
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    // One field for both paths: an @ means an email invite, otherwise a username.
    const value = identifier.trim().replace(/^@/, "");
    const body = value.includes("@") ? { email: value } : { username: value };

    const { data, error: requestError } = await teamRequest<TeamMember>(
      `/api/teams/${team.slug}/members`,
      {
        method: "POST",
        body: JSON.stringify({
          ...body,
          role,
          title: title.trim() || null,
          billable_rate_usd: parseRateInput(rate),
        }),
      }
    );
    setBusy(false);

    if (requestError || !data) {
      setError(requestError);
      return;
    }
    onChange([...members, data]);
    setIdentifier("");
    setTitle("");
    setRate("");
    setRole("member");
  }

  async function updateMember(member: TeamMember, updates: Partial<TeamMember>) {
    setError(null);
    const { data, error: requestError } = await teamRequest<TeamMember>(
      `/api/teams/${team.slug}/members/${member.id}`,
      { method: "PATCH", body: JSON.stringify(updates) }
    );
    if (requestError || !data) {
      setError(requestError);
      return;
    }
    onChange(members.map((m) => (m.id === member.id ? data : m)));
    setEditingId(null);
  }

  async function removeMember(member: TeamMember) {
    if (!confirm(`Remove ${memberDisplayName(member)} from ${team.name}?`)) return;
    setError(null);
    const { error: requestError } = await teamRequest(
      `/api/teams/${team.slug}/members/${member.id}`,
      { method: "DELETE" }
    );
    if (requestError) {
      setError(requestError);
      return;
    }
    onChange(members.filter((m) => m.id !== member.id));
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <form
          onSubmit={addMember}
          className="p-6 bg-card rounded-lg border border-border shadow-sm space-y-4"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Add a member
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="member-identifier">Username or email</Label>
              <Input
                id="member-identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="preshy or preshy@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-role">Role</Label>
              <select
                id="member-role"
                value={role}
                onChange={(e) => setRole(e.target.value as TeamRole)}
                className={`w-full ${selectClass}`}
              >
                {TEAM_ROLES.filter((r) => r !== "owner").map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-rate">Rate / hour</Label>
              <Input
                id="member-rate"
                type="number"
                min={0}
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder={String(team.billable_rate_usd)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="member-title">Title</Label>
            <Input
              id="member-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Backend engineer"
              maxLength={100}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || identifier.trim().length === 0}>
            {busy ? "Adding…" : "Add member"}
          </Button>
        </form>
      )}

      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Rate</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {members.length === 0 && (
                <tr>
                  <td
                    colSpan={canManage ? 6 : 5}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Nobody on this team yet.
                  </td>
                </tr>
              )}
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  team={team}
                  member={member}
                  canManage={canManage}
                  editing={editingId === member.id}
                  onEdit={() => setEditingId(member.id)}
                  onCancel={() => setEditingId(null)}
                  onSave={(updates) => updateMember(member, updates)}
                  onRemove={() => removeMember(member)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {!canManage && (
        <p className="text-sm text-muted-foreground">
          Only owners and admins can change the roster.
        </p>
      )}
    </div>
  );
}

type RowProps = {
  team: Team;
  member: TeamMember;
  canManage: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (updates: Partial<TeamMember>) => void;
  onRemove: () => void;
};

function MemberRow({
  team,
  member,
  canManage,
  editing,
  onEdit,
  onCancel,
  onSave,
  onRemove,
}: RowProps) {
  const isOwnerRow = member.user_id === team.owner_id;
  const effective = resolveBillableRate({
    teamRate: team.billable_rate_usd,
    memberRate: member.billable_rate_usd,
  });

  // The editor is mounted only while editing, so its fields always start from
  // the member as they are now rather than from the last edit.
  if (editing) {
    return (
      <MemberEditRow
        team={team}
        member={member}
        isOwnerRow={isOwnerRow}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
  }

  return (
    <tr className="border-t border-border">
      <td className="px-4 py-3">
        {member.profile?.username ? (
          <Link href={`/u/${member.profile.username}`} className="hover:underline">
            {memberDisplayName(member)}
          </Link>
        ) : (
          memberDisplayName(member)
        )}
      </td>
      <td className="px-4 py-3 capitalize">{member.role}</td>
      <td className="px-4 py-3 text-muted-foreground">{member.title || "\u2014"}</td>
      <td className="px-4 py-3">
        {formatHourlyRate(effective.rate)}
        {effective.source === "team" && (
          <span className="ml-1 text-xs text-muted-foreground">(team)</span>
        )}
      </td>
      <td className="px-4 py-3 capitalize">{member.status}</td>
      {canManage && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit member">
              <Pencil className="h-4 w-4" />
            </Button>
            {!isOwnerRow && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onRemove}
                aria-label="Remove member"
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

type EditRowProps = {
  team: Team;
  member: TeamMember;
  isOwnerRow: boolean;
  onSave: (updates: Partial<TeamMember>) => void;
  onCancel: () => void;
};

function MemberEditRow({ team, member, isOwnerRow, onSave, onCancel }: EditRowProps) {
  const [role, setRole] = useState<TeamRole>(member.role);
  const [title, setTitle] = useState(member.title ?? "");
  const [rate, setRate] = useState(member.billable_rate_usd?.toString() ?? "");

  return (
    <tr className="border-t border-border bg-muted/30">
      <td className="px-4 py-3">{memberDisplayName(member)}</td>
      <td className="px-4 py-3">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as TeamRole)}
          disabled={isOwnerRow}
          className={selectClass}
          aria-label="Role"
        >
          {TEAM_ROLES.filter((r) => r !== "owner" || isOwnerRow).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          aria-label="Title"
        />
      </td>
      <td className="px-4 py-3">
        <Input
          type="number"
          min={0}
          step="0.01"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder={String(team.billable_rate_usd)}
          className="w-28"
          aria-label="Rate"
        />
      </td>
      <td className="px-4 py-3 capitalize">{member.status}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() =>
              onSave({
                ...(isOwnerRow ? {} : { role }),
                title: title.trim() || null,
                billable_rate_usd: parseRateInput(rate),
              } as Partial<TeamMember>)
            }
            aria-label="Save member"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} aria-label="Cancel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
