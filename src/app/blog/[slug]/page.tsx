import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { createServiceClient } from "@/lib/supabase/service";

export const revalidate = 60;
export const dynamicParams = true;

type Row = {
  slug: string;
  title: string;
  meta_description: string | null;
  content_html: string | null;
  image_url: string | null;
  published_at: string;
};

async function fetchPost(slug: string): Promise<Row | null> {
  const sb = createServiceClient();
  const { data } = await (sb as any)
    .from("blog_posts")
    .select("slug, title, meta_description, content_html, image_url, published_at")
    .eq("slug", slug)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await fetchPost(slug);
  if (!post) {
    return {
      title: "Post not found",
      alternates: { canonical: `/blog/${slug}` },
    };
  }
  return {
    title: post.title,
    description: post.meta_description ?? undefined,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: "article",
      url: `/blog/${slug}`,
      title: post.title,
      description: post.meta_description ?? undefined,
      images: post.image_url ? [{ url: post.image_url }] : undefined,
    },
  };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await fetchPost(slug);
  if (!post) notFound();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12 text-foreground">
        <Link
          href="/blog"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-primary"
        >
          ← Back to posts
        </Link>
        <p className="mt-4 text-sm text-muted-foreground">{post.published_at.slice(0, 10)}</p>
        <h1 className="mt-2 text-4xl font-extrabold">{post.title}</h1>
        {post.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.image_url} alt="" className="mt-6 w-full rounded-lg border" />
        )}
        {post.content_html ? (
          // prose handles paragraph color; explicit `prose-a:text-primary`
          // forces links onto our brand blue (default theme makes them
          // foreground-colored which read as white on dark mode).
          <article
            className="prose dark:prose-invert prose-a:text-primary hover:prose-a:underline mt-6 max-w-none"
            dangerouslySetInnerHTML={{ __html: post.content_html }}
          />
        ) : (
          <p className="mt-6 text-muted-foreground">This post has no body content.</p>
        )}
      </main>
    </>
  );
}
