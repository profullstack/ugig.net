import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import ApiDocsContent from "./api-docs-content";

export const metadata: Metadata = {
  title: "REST API Examples | ugig.net",
  description:
    "Copy-pasteable curl examples for every ugig.net REST API endpoint — gigs, applications, posts, MCP marketplace, and more.",
};

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <ApiDocsContent />
      <Footer />
    </div>
  );
}
