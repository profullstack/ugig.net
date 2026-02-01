"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EndorseButton } from "./EndorseButton";
import { EndorsersList } from "./EndorsersList";
import type { SkillEndorsementSummary } from "@/types";

interface SkillEndorsementsProps {
  username: string;
  skills: string[];
  isOwnProfile: boolean;
  currentUserId?: string;
}

export function SkillEndorsements({
  username,
  skills,
  isOwnProfile,
  currentUserId,
}: SkillEndorsementsProps) {
  const [endorsements, setEndorsements] = useState<SkillEndorsementSummary[]>(
    []
  );
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEndorsements = async () => {
    try {
      const res = await fetch(
        `/api/users/${encodeURIComponent(username)}/endorsements`
      );
      if (res.ok) {
        const json = await res.json();
        setEndorsements(json.data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEndorsements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  // Build a map of skill -> endorsement summary
  const endorsementMap = new Map<string, SkillEndorsementSummary>();
  for (const e of endorsements) {
    endorsementMap.set(e.skill.toLowerCase(), e);
  }

  // Merge skills with endorsements, skills without endorsements still show
  const allSkills = skills.map((skill) => {
    const endorsement = endorsementMap.get(skill.toLowerCase());
    return {
      skill,
      count: endorsement?.count || 0,
      endorsers: endorsement?.endorsers || [],
      endorsed_by_current_user:
        endorsement?.endorsed_by_current_user || false,
    };
  });

  // Sort: most endorsed first, then alphabetically
  allSkills.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.skill.localeCompare(b.skill);
  });

  if (loading) {
    return (
      <div className="p-6 bg-card rounded-lg border border-border">
        <h2 className="text-lg font-semibold mb-3">Skills</h2>
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <Badge key={skill} variant="secondary" className="animate-pulse">
              {skill}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-card rounded-lg border border-border">
      <h2 className="text-lg font-semibold mb-3">Skills</h2>
      <div className="flex flex-wrap gap-2">
        {allSkills.map(({ skill, count, endorsed_by_current_user }) => (
          <div key={skill} className="flex items-center gap-1">
            <Badge
              variant={count > 0 ? "default" : "secondary"}
              className={`cursor-pointer transition-colors ${
                count > 0 ? "bg-primary/90 hover:bg-primary" : ""
              }`}
              onClick={() =>
                setExpandedSkill(expandedSkill === skill ? null : skill)
              }
            >
              {skill}
              {count > 0 && (
                <span className="ml-1.5 text-xs opacity-80">({count})</span>
              )}
            </Badge>
            {!isOwnProfile && currentUserId && (
              <EndorseButton
                username={username}
                skill={skill}
                isEndorsed={endorsed_by_current_user}
                count={count}
                onEndorsed={fetchEndorsements}
              />
            )}
          </div>
        ))}
      </div>

      {/* Expanded endorser list */}
      {expandedSkill && (
        <EndorsersList
          username={username}
          skill={expandedSkill}
          onClose={() => setExpandedSkill(null)}
        />
      )}
    </div>
  );
}
