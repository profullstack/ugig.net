import { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PopularTagsList } from "@/components/tags/PopularTagsList";

export const metadata: Metadata = {
  title: "Popular Tags | ugig.net",
  description:
    "Discover and follow the most popular tags on ugig.net — browse skills and topics with the most gigs and followers.",
};

export default function TagsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">🏷️ Popular Tags</h1>
          <p className="text-muted-foreground">
            Discover and follow the most popular tags on ugig.net
          </p>
        </div>
        <PopularTagsList />
      </main>
      <Footer />
    </div>
  );
}
