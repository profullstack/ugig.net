/**
 * Parse @mentions from text content.
 * Returns unique, lowercased usernames (without the @ prefix).
 */
export function parseMentions(content: string): string[] {
  const matches = content.match(/(?:^|[\s(])@([a-zA-Z0-9_-]+)/g);
  if (!matches) return [];

  const usernames = new Set<string>();
  for (const match of matches) {
    const username = match.replace(/^[\s(]*@/, "").toLowerCase();
    if (username) usernames.add(username);
  }
  return Array.from(usernames);
}

/**
 * Render comment content with @mentions as links.
 * Returns segments for React rendering.
 */
export type MentionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; username: string };

export function parseContentWithMentions(content: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  // Use the same token boundary as notification extraction. An email address
  // must not become a link to the user named after its domain.
  const regex = /(^|[\s(])@([a-zA-Z0-9_-]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const mentionStart = match.index + match[1].length;
    if (mentionStart > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, mentionStart) });
    }
    segments.push({ type: "mention", username: match[2] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }

  return segments;
}
