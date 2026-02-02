import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { PortfolioGrid } from "@/components/portfolio/PortfolioGrid";
import Link from "next/link";

export const metadata = {
  title: "My Portfolio | ugig.net",
  description: "Manage your portfolio items",
};

export default async function DashboardPortfolioPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/portfolio");
  }

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
            <span>/</span>
            <span>Portfolio</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">My Portfolio</h1>
          <p className="text-muted-foreground">
            Showcase your best work. Add completed projects, demos, and case studies
            to attract more clients.
          </p>
        </div>

        <PortfolioGrid userId={user.id} isOwner={true} />
      </main>
    </div>
  );
}
