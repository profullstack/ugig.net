"use client";

import { useState } from "react";
import { FolderKanban, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  TEAM_PROJECT_STATUSES,
  formatHourlyRate,
  parseRateInput,
  resolveBillableRate,
  type TeamProjectStatus,
} from "@/lib/teams";
import { teamRequest } from "./api";
import {
  memberDisplayName,
  type ProjectAssignment,
  type Team,
  type TeamMember,
  type TeamProject,
} from "./types";

type Props = {
  team: Team;
  members: TeamMember[];
  projects: TeamProject[];
  assignments: ProjectAssignment[];
  canManage: boolean;
  onProjectsChange: (projects: TeamProject[]) => void;
  onAssignmentsChange: (assignments: ProjectAssignment[]) => void;
};

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TeamProjectsPanel({
  team,
  members,
  projects,
  assignments,
  canManage,
  onProjectsChange,
  onAssignmentsChange,
}: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const { data, error: requestError } = await teamRequest<TeamProject>(
      `/api/teams/${team.slug}/projects`,
      {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          billable_rate_usd: parseRateInput(rate),
        }),
      }
    );
    setBusy(false);
    if (requestError || !data) {
      setError(requestError);
      return;
    }
    onProjectsChange([data, ...projects]);
    setName("");
    setDescription("");
    setRate("");
  }

  async function updateProject(project: TeamProject, updates: Partial<TeamProject>) {
    setError(null);
    const { data, error: requestError } = await teamRequest<TeamProject>(
      `/api/teams/${team.slug}/projects/${project.id}`,
      { method: "PATCH", body: JSON.stringify(updates) }
    );
    if (requestError || !data) {
      setError(requestError);
      return;
    }
    onProjectsChange(projects.map((p) => (p.id === project.id ? data : p)));
    setEditingId(null);
  }

  async function deleteProject(project: TeamProject) {
    if (!confirm(`Delete ${project.name}? Its assignments go with it.`)) return;
    setError(null);
    const { error: requestError } = await teamRequest(
      `/api/teams/${team.slug}/projects/${project.id}`,
      { method: "DELETE" }
    );
    if (requestError) {
      setError(requestError);
      return;
    }
    onProjectsChange(projects.filter((p) => p.id !== project.id));
    onAssignmentsChange(assignments.filter((a) => a.project_id !== project.id));
  }

  async function assign(project: TeamProject, memberId: string, rateOverride: number | null) {
    setError(null);
    const { data, error: requestError } = await teamRequest<ProjectAssignment>(
      `/api/teams/${team.slug}/projects/${project.id}/members`,
      {
        method: "POST",
        body: JSON.stringify({ member_id: memberId, billable_rate_usd: rateOverride }),
      }
    );
    if (requestError || !data) {
      setError(requestError);
      return;
    }
    const others = assignments.filter(
      (a) => !(a.project_id === project.id && a.member_id === memberId)
    );
    onAssignmentsChange([...others, data]);
  }

  async function unassign(project: TeamProject, memberId: string) {
    setError(null);
    const { error: requestError } = await teamRequest(
      `/api/teams/${team.slug}/projects/${project.id}/members?member_id=${memberId}`,
      { method: "DELETE" }
    );
    if (requestError) {
      setError(requestError);
      return;
    }
    onAssignmentsChange(
      assignments.filter((a) => !(a.project_id === project.id && a.member_id === memberId))
    );
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <form
          onSubmit={createProject}
          className="p-6 bg-card rounded-lg border border-border shadow-sm space-y-4"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plus className="h-5 w-5" /> New project
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Checkout rebuild"
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-rate">Rate / hour</Label>
              <Input
                id="project-rate"
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
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={1000}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || name.trim().length < 2}>
            {busy ? "Creating…" : "Create project"}
          </Button>
        </form>
      )}

      {projects.length === 0 ? (
        <div className="p-8 bg-card rounded-lg border border-border text-center">
          <FolderKanban className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No projects yet.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {projects.map((project) => (
            <li key={project.id}>
              <ProjectCard
                team={team}
                project={project}
                members={members}
                assignments={assignments.filter((a) => a.project_id === project.id)}
                canManage={canManage}
                editing={editingId === project.id}
                onEdit={() => setEditingId(project.id)}
                onCancel={() => setEditingId(null)}
                onSave={(updates) => updateProject(project, updates)}
                onDelete={() => deleteProject(project)}
                onAssign={(memberId, rateOverride) => assign(project, memberId, rateOverride)}
                onUnassign={(memberId) => unassign(project, memberId)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CardProps = {
  team: Team;
  project: TeamProject;
  members: TeamMember[];
  assignments: ProjectAssignment[];
  canManage: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (updates: Partial<TeamProject>) => void;
  onDelete: () => void;
  onAssign: (memberId: string, rate: number | null) => void;
  onUnassign: (memberId: string) => void;
};

function ProjectCard({
  team,
  project,
  members,
  assignments,
  canManage,
  editing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onAssign,
  onUnassign,
}: CardProps) {
  const [assigneeId, setAssigneeId] = useState("");
  const [assigneeRate, setAssigneeRate] = useState("");

  const projectRate = resolveBillableRate({
    teamRate: team.billable_rate_usd,
    projectRate: project.billable_rate_usd,
  });

  const assigned = assignments
    .map((assignment) => {
      const member = members.find((m) => m.id === assignment.member_id);
      return member ? { assignment, member } : null;
    })
    .filter((row): row is { assignment: ProjectAssignment; member: TeamMember } => row !== null);

  const unassigned = members.filter(
    (m) => m.status !== "removed" && !assignments.some((a) => a.member_id === m.id)
  );

  return (
    <div className="p-6 bg-card rounded-lg border border-border shadow-sm space-y-4">
      {editing ? (
        <ProjectEditForm team={team} project={project} onSave={onSave} onCancel={onCancel} />
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{project.name}</h3>
            {project.description && (
              <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
              <span className="px-2 py-0.5 rounded-full bg-muted text-xs capitalize">
                {project.status}
              </span>
              <span>
                {formatHourlyRate(projectRate.rate)}
                {projectRate.source === "team" && (
                  <span className="ml-1 text-xs text-muted-foreground">(team)</span>
                )}
              </span>
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit project">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                aria-label="Delete project"
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border pt-4">
        <h4 className="text-sm font-medium mb-3">On this project</h4>
        {assigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody assigned yet.</p>
        ) : (
          <ul className="space-y-2">
            {assigned.map(({ assignment, member }) => {
              const effective = resolveBillableRate({
                teamRate: team.billable_rate_usd,
                projectRate: project.billable_rate_usd,
                memberRate: member.billable_rate_usd,
                assignmentRate: assignment.billable_rate_usd,
              });
              return (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-4 text-sm py-1"
                >
                  <span className="min-w-0 truncate">
                    {memberDisplayName(member)}
                    {member.title && (
                      <span className="text-muted-foreground"> · {member.title}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span>
                      {formatHourlyRate(effective.rate)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({effective.source})
                      </span>
                    </span>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onUnassign(member.id)}
                        aria-label={`Remove ${memberDisplayName(member)} from ${project.name}`}
                        className="text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {canManage && unassigned.length > 0 && (
          <div className="flex flex-wrap items-end gap-3 mt-4">
            <div className="space-y-2">
              <Label htmlFor={`assign-${project.id}`}>Assign</Label>
              <select
                id={`assign-${project.id}`}
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={selectClass}
              >
                <option value="">Choose a member…</option>
                {unassigned.map((member) => (
                  <option key={member.id} value={member.id}>
                    {memberDisplayName(member)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`assign-rate-${project.id}`}>Rate / hour</Label>
              <Input
                id={`assign-rate-${project.id}`}
                type="number"
                min={0}
                step="0.01"
                value={assigneeRate}
                onChange={(e) => setAssigneeRate(e.target.value)}
                placeholder={String(projectRate.rate)}
                className="w-32"
              />
            </div>
            <Button
              size="sm"
              disabled={!assigneeId}
              onClick={() => {
                onAssign(assigneeId, parseRateInput(assigneeRate));
                setAssigneeId("");
                setAssigneeRate("");
              }}
            >
              Add to project
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

type EditFormProps = {
  team: Team;
  project: TeamProject;
  onSave: (updates: Partial<TeamProject>) => void;
  onCancel: () => void;
};

/**
 * Mounted only while the project is being edited, so the fields always start
 * from the project as it is now rather than from the previous edit.
 */
function ProjectEditForm({ team, project, onSave, onCancel }: EditFormProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [status, setStatus] = useState<TeamProjectStatus>(project.status);
  const [rate, setRate] = useState(project.billable_rate_usd?.toString() ?? "");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`name-${project.id}`}>Name</Label>
          <Input
            id={`name-${project.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`rate-${project.id}`}>Rate / hour</Label>
          <Input
            id={`rate-${project.id}`}
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
        <Label htmlFor={`description-${project.id}`}>Description</Label>
        <Textarea
          id={`description-${project.id}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={1000}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`status-${project.id}`}>Status</Label>
        <select
          id={`status-${project.id}`}
          value={status}
          onChange={(e) => setStatus(e.target.value as TeamProjectStatus)}
          className={selectClass}
        >
          {TEAM_PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() =>
            onSave({
              name: name.trim(),
              description: description.trim() || null,
              status,
              billable_rate_usd: parseRateInput(rate),
            } as Partial<TeamProject>)
          }
        >
          <Check className="h-4 w-4 mr-1" /> Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
      </div>
    </div>
  );
}
