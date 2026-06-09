const HOUR_MS = 60 * 60 * 1000;

type RankablePost = {
  created_at: string;
  score?: number | null;
};

export function getIsoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * HOUR_MS).toISOString();
}

export function sortPostsByHot<T extends RankablePost>(posts: T[]): T[] {
  const now = Date.now();

  return [...posts].sort((a, b) => {
    const ageA = (now - new Date(a.created_at).getTime()) / HOUR_MS;
    const ageB = (now - new Date(b.created_at).getTime()) / HOUR_MS;
    const hotA = (a.score || 0) / Math.pow(ageA + 2, 1.8);
    const hotB = (b.score || 0) / Math.pow(ageB + 2, 1.8);

    return hotB - hotA;
  });
}
