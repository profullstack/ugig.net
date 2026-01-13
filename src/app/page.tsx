import Link from "next/link";
import { Search, Users, Video, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-primary">
            ugig.net
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/gigs"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Browse Gigs
            </Link>
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
            >
              Sign Up
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="py-20 px-4">
          <div className="container mx-auto text-center max-w-4xl">
            <h1 className="text-5xl font-bold mb-6">
              The Marketplace for{" "}
              <span className="text-primary">AI-Assisted</span> Professionals
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Connect with skilled engineers and workers who leverage AI tools
              to deliver exceptional results. Free to browse, free to apply.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/gigs"
                className="bg-primary text-primary-foreground px-8 py-3 rounded-md text-lg font-medium hover:bg-primary/90 transition-colors"
              >
                Browse Gigs
              </Link>
              <Link
                href="/signup"
                className="bg-secondary text-secondary-foreground px-8 py-3 rounded-md text-lg font-medium hover:bg-secondary/80 transition-colors"
              >
                Post a Gig
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 px-4 bg-muted">
          <div className="container mx-auto max-w-6xl">
            <h2 className="text-3xl font-bold text-center mb-12">
              Why ugig.net?
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <FeatureCard
                icon={<Zap className="w-8 h-8" />}
                title="AI-First Talent"
                description="Find professionals who excel at using AI tools like ChatGPT, Copilot, and Claude to boost productivity."
              />
              <FeatureCard
                icon={<Search className="w-8 h-8" />}
                title="Public Listings"
                description="Browse all gigs without creating an account. Only sign up when you're ready to apply or post."
              />
              <FeatureCard
                icon={<Users className="w-8 h-8" />}
                title="Direct Communication"
                description="Built-in chat system lets you communicate directly with clients or talent without leaving the platform."
              />
              <FeatureCard
                icon={<Video className="w-8 h-8" />}
                title="Video Interviews"
                description="Conduct video calls directly on ugig.net with our integrated Jitsi-powered video chat."
              />
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl font-bold mb-4">Simple, Fair Pricing</h2>
            <p className="text-muted-foreground mb-12">
              Free to get started. Only pay when you need more.
            </p>
            <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
              <div className="border border-border rounded-lg p-8">
                <h3 className="text-xl font-bold mb-2">Free</h3>
                <p className="text-3xl font-bold mb-4">
                  $0<span className="text-lg font-normal">/month</span>
                </p>
                <ul className="text-left space-y-2 text-muted-foreground">
                  <li>Browse all gigs</li>
                  <li>Apply to unlimited gigs</li>
                  <li>Post up to 10 gigs/month</li>
                  <li>Messaging & video calls</li>
                  <li>Public profile</li>
                </ul>
              </div>
              <div className="border-2 border-primary rounded-lg p-8 relative">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm">
                  Pro
                </span>
                <h3 className="text-xl font-bold mb-2">Pro</h3>
                <p className="text-3xl font-bold mb-4">
                  $5.99<span className="text-lg font-normal">/month</span>
                </p>
                <ul className="text-left space-y-2 text-muted-foreground">
                  <li>Everything in Free</li>
                  <li>Unlimited gig posts</li>
                  <li>Priority support</li>
                  <li>Featured profile badge</li>
                  <li>Advanced analytics</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 px-4 bg-primary text-primary-foreground">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-xl mb-8 opacity-90">
              Join thousands of AI-assisted professionals finding work on
              ugig.net
            </p>
            <Link
              href="/signup"
              className="bg-white text-primary px-8 py-3 rounded-md text-lg font-medium hover:bg-white/90 transition-colors inline-block"
            >
              Create Free Account
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-muted-foreground">
            &copy; {new Date().getFullYear()} ugig.net. All rights reserved.
          </p>
          <nav className="flex gap-6 text-muted-foreground">
            <Link href="/about" className="hover:text-foreground">
              About
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
