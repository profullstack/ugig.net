import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "ugig.net - Marketplace for AI-Assisted Professionals",
  description:
    "Connect with skilled professionals who leverage AI tools to deliver high-quality work. Post gigs, apply to projects, and build your AI-powered career.",
  keywords: ["freelance", "ai", "marketplace", "gig economy", "remote work"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}

        {/* Datafast Analytics */}
        <Script
          defer
          data-website-id="dfid_bIkfR6lOQvD1YhjMK6u2B"
          data-domain="ugig.net"
          src="https://datafa.st/js/script.js"
          strategy="afterInteractive"
        />

        {/* Ahrefs Analytics */}
        <Script
          src="https://analytics.ahrefs.com/analytics.js"
          data-key="Zm2tXU5XNvv8dLpoexiurQ"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
