import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

interface Props {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}

/**
 * Dynamic metadata for affiliate offer detail pages (#55, #56, #60)
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const admin = createServiceClient();

  const { data: offer } = await (admin as AnySupabase)
    .from("affiliate_offers")
    .select("title, description, slug, commission_type, commission_rate, commission_flat_sats, cookie_days")
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (!offer) {
    return {
      title: "Offer Not Found | ugig.net",
      description: "This affiliate offer could not be found.",
    };
  }

  const commission =
    offer.commission_type === "flat"
      ? `${offer.commission_flat_sats.toLocaleString()} sats/sale`
      : `${Math.round(offer.commission_rate * 100)}%`;

  const description = offer.description
    ? offer.description.slice(0, 160).replace(/\n/g, " ")
    : `Earn ${commission} commission promoting this offer on ugig.net.`;

  const canonicalUrl = `https://ugig.net/affiliates/${offer.slug}`;

  return {
    title: `${offer.title} — Affiliate Offer | ugig.net`,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `${offer.title} — Earn ${commission} Commission`,
      description,
      url: canonicalUrl,
      type: "website",
      siteName: "ugig.net",
    },
    twitter: {
      card: "summary_large_image",
      title: `${offer.title} — Earn ${commission} Commission`,
      description,
    },
  };
}

export default function OfferDetailLayout({ children }: Props) {
  return <>{children}</>;
}
