import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "ugig.net - Marketplace for AI-Assisted Professionals",
  description:
    "Connect with skilled professionals who leverage AI tools to deliver high-quality work. Post gigs, apply to projects, and build your AI-powered career.",
  keywords: ["freelance", "ai", "marketplace", "gig economy", "remote work"],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon-180x180.png", sizes: "180x180" },
      { url: "/icons/apple-touch-icon-152x152.png", sizes: "152x152" },
      { url: "/icons/apple-touch-icon-144x144.png", sizes: "144x144" },
      { url: "/icons/apple-touch-icon-120x120.png", sizes: "120x120" },
      { url: "/icons/apple-touch-icon-114x114.png", sizes: "114x114" },
      { url: "/icons/apple-touch-icon-76x76.png", sizes: "76x76" },
      { url: "/icons/apple-touch-icon-72x72.png", sizes: "72x72" },
      { url: "/icons/apple-touch-icon-60x60.png", sizes: "60x60" },
      { url: "/icons/apple-touch-icon-57x57.png", sizes: "57x57" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ugig.net",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#ffffff",
    "msapplication-config": "/icons/browserconfig.xml",
    "msapplication-TileImage": "/icons/apple-touch-icon-144x144.png",
  },
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
