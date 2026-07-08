import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { AdUnit } from "@/components/AdUnit";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata = {
  title: "Blog · ugig",
  description: "Latest from the ugig team and partners.",
  alternates: { canonical: "/blog" },
};

export const dynamic = "force-dynamic";

type Row = {
  slug: string;
  title: string;
  meta_description: string | null;
  published_at: string;
  image_url: string | null;
  tags: string[] | null;
};

// Stable per-slug accent for the no-thumbnail fallback so each card keeps
// its own colour between renders. Hash → 5-stop gradient palette.
const PALETTES = [
  "from-violet-500/40 to-fuchsia-500/30",
  "from-sky-500/40 to-cyan-500/30",
  "from-emerald-500/40 to-teal-500/30",
  "from-amber-500/40 to-orange-500/30",
  "from-rose-500/40 to-pink-500/30",
];

function paletteFor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length]!;
}

function initialsFor(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export default async function BlogIndex() {
  const sb = createServiceClient();
  const { data } = await (sb as any)
    .from("blog_posts")
    .select("slug, title, meta_description, published_at, image_url, tags")
    .order("published_at", { ascending: false })
    .limit(200);

  const posts = (data ?? []) as Row[];

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-12 text-foreground">
        <header className="mb-10">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Blog
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Tips on freelancing, AI-assisted work, and the gig economy.
          </p>
        </header>

        {posts.length === 0 ? (
          <p className="mt-10 text-sm text-muted-foreground">
            No posts yet — check back soon.
          </p>
        ) : (
          <ul className="grid gap-5">
            {posts.map((p) => (
              <li
                key={p.slug}
                className="group overflow-hidden rounded-xl border bg-card transition hover:border-primary/40 hover:shadow-lg"
              >
                <Link
                  href={`/blog/${p.slug}`}
                  className="grid grid-cols-1 sm:grid-cols-[200px_1fr] items-stretch"
                >
                  <div className="relative aspect-[4/3] sm:aspect-auto sm:h-full overflow-hidden bg-muted">
                    {p.image_url ? (
                      <Image
                        src={p.image_url}
                        alt=""
                        fill
                        sizes="(min-width: 640px) 200px, 100vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div
                        className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${paletteFor(
                          p.slug,
                        )}`}
                        aria-hidden="true"
                      >
                        <span className="text-4xl font-black text-foreground/70">
                          {initialsFor(p.title)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-5 sm:p-6">
                    <h2 className="text-xl font-bold leading-snug group-hover:text-primary transition-colors">
                      {p.title}
                    </h2>
                    {p.meta_description && (
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        {p.meta_description}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                      <time dateTime={p.published_at}>
                        {p.published_at.slice(0, 10)}
                      </time>
                      {p.tags && p.tags.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <div className="flex flex-wrap gap-1.5">
                            {p.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="rounded-full border bg-background px-2 py-0.5"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <AdUnit />
      </main>
    </>
  );
}
