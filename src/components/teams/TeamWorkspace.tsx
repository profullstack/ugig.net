"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Users, FolderKanban, Settings } from "lucide-react";
import { formatHourlyRate } from "@/lib/teams";
import { TeamMembersPanel } from "./TeamMembersPanel";
import { TeamProjectsPanel } from "./TeamProjectsPanel";
import { TeamSettingsPanel } from "./TeamSettingsPanel";
import type { ProjectAssignment, Team, TeamMember, TeamProject } from "./types";

type Props = {
  team: Team;
  members: TeamMember[];
  projects: TeamProject[];
  assignments: ProjectAssignment[];
  canManage: boolean;
  isOwner: boolean;
};

type TabKey = "members" | "projects" | "settings";

const TABS: { key: TabKey; label: string; icon: typeof Users }[] = [
  { key: "members", label: "Members", icon: Users },
  { key: "projects", label: "Projects", icon: FolderKanban },
  { key: "settings", label: "Settings", icon: Settings },
];

export function TeamWorkspace({
  team: initialTeam,
  members: initialMembers,
  projects: initialProjects,
  assignments: initialAssignments,
  canManage,
  isOwner,
}: Props) {
  const [team, setTeam] = useState(initialTeam);
  const [members, setMembers] = useState(initialMembers);
  const [projects, setProjects] = useState(initialProjects);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [tab, setTab] = useState<TabKey>("members");

  const activeMembers = members.filter((m) => m.status !== "removed");

  return (
    <main className="container mx-auto px-4 py-8">
      <Link
        href="/teams"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> All teams
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">{team.name}</h1>
          {team.description && <p className="text-muted-foreground mt-1">{team.description}</p>}
        </div>
        <div className="p-4 bg-card rounded-lg border border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Team rate</p>
          <p className="text-2xl font-bold">{formatHourlyRate(team.billable_rate_usd)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-border mb-6">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer transition-colors ${
              tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {key === "members" && (
              <span className="text-xs text-muted-foreground">({activeMembers.length})</span>
            )}
            {key === "projects" && (
              <span className="text-xs text-muted-foreground">({projects.length})</span>
            )}
          </button>
        ))}
      </div>

      {tab === "members" && (
        <TeamMembersPanel
          team={team}
          members={members}
          canManage={canManage}
          onChange={setMembers}
        />
      )}

      {tab === "projects" && (
        <TeamProjectsPanel
          team={team}
          members={activeMembers}
          projects={projects}
          assignments={assignments}
          canManage={canManage}
          onProjectsChange={setProjects}
          onAssignmentsChange={setAssignments}
        />
      )}

      {tab === "settings" && (
        <TeamSettingsPanel team={team} canManage={canManage} isOwner={isOwner} onChange={setTeam} />
      )}
    </main>
  );
}
