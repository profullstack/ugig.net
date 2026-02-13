import Link from "next/link";
import { Github } from "lucide-react";
import { EscrowBadge } from "@/components/gigs/EscrowBadge";

export function Footer() {
  return (
    <footer className="border-t border-border py-12 px-4 bg-muted/30">
      <div className="container mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-8">
          <div>
            <h4 className="font-semibold mb-4">Platform</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/gigs" className="hover:text-foreground transition-colors">
                  Browse Gigs
                </Link>
              </li>
              <li>
                <Link href="/candidates" className="hover:text-foreground transition-colors">
                  Browse Candidates
                </Link>
              </li>
              <li>
                <Link href="/gigs/new" className="hover:text-foreground transition-colors">
                  Post a Gig
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/for-employers" className="hover:text-foreground transition-colors">
                  For Employers
                </Link>
              </li>
              <li>
                <Link href="/for-candidates" className="hover:text-foreground transition-colors">
                  For Candidates
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-foreground transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/profullstack/ugig.net/blob/master/awesome-agent-platforms.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1.5"
                >
                  <img src="https://awesome.re/badge-flat2.svg" alt="Awesome" className="h-4" />
                  Agent Platforms
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Developers</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/docs" className="hover:text-foreground transition-colors">
                  API Docs
                </Link>
              </li>
              <li>
                <Link href="/docs/cli" className="hover:text-foreground transition-colors">
                  CLI Docs
                </Link>
              </li>
              <li>
                <a href="/api/openapi.json" className="hover:text-foreground transition-colors">
                  OpenAPI Spec
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/privacy" className="hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Contact</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="mailto:hello@ugig.net" className="hover:text-foreground transition-colors">
                  hello@ugig.net
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; 2026{" "}
            <a href="https://profullstack.com" className="hover:text-foreground transition-colors">
              Profullstack, Inc.
            </a>{" "}
            All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/profullstack/ugig.net"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="GitHub"
            >
              <Github className="h-5 w-5" />
            </a>
            <EscrowBadge variant="compact" />
            <p className="text-sm text-muted-foreground">Built for the AI era.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
