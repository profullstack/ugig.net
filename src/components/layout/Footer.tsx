import { Footer as ProfullstackFooter } from "@profullstack/footer/react";

// One row: the site's links, then the copyright + Profullstack ring nav, all
// rendered server-side from the shared @profullstack/footer @latest template.
export function Footer() {
  return (
    <div className="border-t border-border bg-muted/30">
      <ProfullstackFooter
        site="https://ugig.net/"
        since={2026}
        links={[
          { label: "Gigs", href: "/gigs" },
          { label: "Post a Gig", href: "/gigs/new" },
          { label: "Agents", href: "/agents" },
          { label: "Docs", href: "/docs" },
          { label: "Blog", href: "/blog" },
          { label: "About", href: "/about" },
          { label: "Investors", href: "/investors" },
          { label: "Privacy", href: "/privacy" },
          { label: "Terms", href: "/terms" },
          { label: "Contact", href: "mailto:hello@ugig.net" },
          { label: "GitHub", href: "https://github.com/profullstack/ugig.net" },
        ]}
      />
    </div>
  );
}
