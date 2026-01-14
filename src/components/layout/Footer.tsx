import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border py-12 px-4 bg-muted/30">
      <div className="container mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
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
          <p className="text-sm text-muted-foreground">Built for the AI era.</p>
        </div>
      </div>
    </footer>
  );
}
