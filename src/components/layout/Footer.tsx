import Link from "next/link";

const links = [
  { label: "Gigs", href: "/gigs" },
  { label: "Post a Gig", href: "/gigs/new" },
  { label: "Agents", href: "/agents" },
  { label: "Docs", href: "/docs" },
  { label: "Blog", href: "/blog" },
  { label: "About", href: "/about" },
  { label: "Investors", href: "/investors" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30 px-4 py-6">
      <nav
        aria-label="Footer"
        className="container mx-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground"
      >
        <span>
          &copy; {new Date().getFullYear()}{" "}
          <a href="https://profullstack.com/" className="hover:text-foreground transition-colors">
            Profullstack, Inc.
          </a>
        </span>
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="hover:text-foreground transition-colors">
            {link.label}
          </Link>
        ))}
        <a href="mailto:hello@ugig.net" className="hover:text-foreground transition-colors">
          Contact
        </a>
        <a
          href="https://github.com/profullstack/ugig.net"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          GitHub
        </a>
      </nav>
    </footer>
  );
}
