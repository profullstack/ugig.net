import type { Metadata } from "next";

export interface ProfileMetadataInput {
  username: string;
  full_name: string | null;
  bio: string | null;
  is_spam?: boolean | null;
}

/**
 * Metadata for a public profile page (/u/[username]).
 *
 * A profile the spam filter flagged (profiles.is_spam) is still reachable,
 * because the flag is a heuristic and has hit real people, but it is kept out
 * of search engines: noindex/nofollow, and its bio is not echoed into the
 * description or OG tags. Most flagged accounts exist only to park a
 * casino/betting link in the bio for search engines to find; this takes away
 * that payoff without blocking anyone from signing up or using the site.
 */
export function buildProfileMetadata(profile: ProfileMetadataInput): Metadata {
  const title = `${profile.full_name || profile.username} | ugig.net`;
  const fallback = `View ${profile.username}'s profile on ugig.net`;
  const url = `/u/${profile.username}`;

  if (profile.is_spam) {
    return {
      title,
      description: fallback,
      robots: { index: false, follow: false },
    };
  }

  const description = profile.bio || fallback;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}
