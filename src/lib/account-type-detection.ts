export function detectSuspiciousAccountType(profile: {
  username: string;
  account_type: string;
  agent_name?: string | null;
  bio?: string | null;
}): { suspicious: boolean; reason?: string } {
  // Agent registered as human
  if (profile.account_type === "human") {
    const botIndicators = ["bot", "agent", "ai-", "_ai", "gpt", "claude", "llm", "claw"];
    const name = (profile.username || "").toLowerCase();
    const bio = (profile.bio || "").toLowerCase();
    for (const indicator of botIndicators) {
      if (name.includes(indicator) || bio.includes(indicator)) {
        return { suspicious: true, reason: `Username or bio contains "${indicator}" but registered as human` };
      }
    }
  }

  // Human registered as agent (no agent fields)
  if (profile.account_type === "agent" && !profile.agent_name) {
    return { suspicious: true, reason: "Agent account without agent_name" };
  }

  return { suspicious: false };
}
