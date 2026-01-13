import Link from "next/link";
import { Search, Users, Video, Zap, Check, ArrowRight, Sparkles, Shield, Clock } from "lucide-react";
import { Header } from "@/components/layout/Header";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      {/* Hero Section */}
      <main className="flex-1">
        <section className="py-24 px-4 bg-gradient-to-b from-primary/5 to-transparent">
          <div className="container mx-auto text-center max-w-4xl">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Sparkles className="h-4 w-4" />
              The future of freelancing is here
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
              The Marketplace for{" "}
              <span className="text-primary">AI-Powered</span> Professionals
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Connect with skilled engineers and workers who leverage AI tools
              to deliver exceptional results faster. Free to browse, free to apply.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/gigs"
                className="bg-primary text-primary-foreground px-8 py-3.5 rounded-lg text-lg font-medium hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
              >
                Browse Gigs
              </Link>
              <Link
                href="/signup"
                className="bg-card text-foreground border border-border px-8 py-3.5 rounded-lg text-lg font-medium hover:bg-muted transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
              >
                Post a Gig
              </Link>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              No credit card required &bull; Free forever plan available
            </p>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 px-4 bg-muted/50">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">
                Why ugig.net?
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Built for the AI era, our platform connects businesses with professionals who use cutting-edge tools.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <FeatureCard
                icon={<Zap className="w-6 h-6" />}
                title="AI-First Talent"
                description="Find professionals who excel at using AI tools like ChatGPT, Copilot, and Claude to boost productivity."
              />
              <FeatureCard
                icon={<Search className="w-6 h-6" />}
                title="Public Listings"
                description="Browse all gigs without creating an account. Only sign up when you're ready to apply or post."
              />
              <FeatureCard
                icon={<Users className="w-6 h-6" />}
                title="Direct Communication"
                description="Built-in chat system lets you communicate directly with clients or talent without leaving the platform."
              />
              <FeatureCard
                icon={<Video className="w-6 h-6" />}
                title="Video Interviews"
                description="Conduct video calls directly on ugig.net with our integrated Jitsi-powered video chat."
              />
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-20 px-4">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">How It Works</h2>
              <p className="text-muted-foreground">Get started in minutes</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground text-xl font-bold flex items-center justify-center mx-auto mb-4">1</div>
                <h3 className="font-semibold text-lg mb-2">Create Your Profile</h3>
                <p className="text-muted-foreground text-sm">Sign up and showcase your skills, AI tools, and portfolio in minutes.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground text-xl font-bold flex items-center justify-center mx-auto mb-4">2</div>
                <h3 className="font-semibold text-lg mb-2">Find Opportunities</h3>
                <p className="text-muted-foreground text-sm">Browse gigs or post your own. Our matching helps you find the right fit.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground text-xl font-bold flex items-center justify-center mx-auto mb-4">3</div>
                <h3 className="font-semibold text-lg mb-2">Connect & Collaborate</h3>
                <p className="text-muted-foreground text-sm">Message, video call, and work together directly on the platform.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="py-20 px-4 bg-muted/50">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl font-bold mb-4">Simple, Fair Pricing</h2>
            <p className="text-muted-foreground mb-12">
              Free to get started. Only pay when you need more.
            </p>
            <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
              <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
                <h3 className="text-xl font-bold mb-2">Free</h3>
                <p className="text-4xl font-bold mb-6">
                  $0<span className="text-lg font-normal text-muted-foreground">/month</span>
                </p>
                <ul className="text-left space-y-3">
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Browse all gigs</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Apply to unlimited gigs</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Post up to 10 gigs/month</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Messaging & video calls</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Public profile</span>
                  </li>
                </ul>
                <Link
                  href="/signup"
                  className="mt-8 block w-full py-3 rounded-lg border border-border text-center font-medium hover:bg-muted transition-colors"
                >
                  Get Started Free
                </Link>
              </div>
              <div className="bg-card border-2 border-primary rounded-xl p-8 shadow-lg relative">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </span>
                <h3 className="text-xl font-bold mb-2">Pro</h3>
                <p className="text-4xl font-bold mb-1">
                  $9<span className="text-lg font-normal text-muted-foreground">/month</span>
                </p>
                <p className="text-sm text-muted-foreground mb-6">
                  billed annually, or $29/mo
                </p>
                <ul className="text-left space-y-3">
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Everything in Free</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Unlimited gig posts</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Priority support</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Featured profile badge</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Advanced analytics</span>
                  </li>
                </ul>
                <Link
                  href="/signup"
                  className="mt-8 block w-full py-3 rounded-lg bg-primary text-primary-foreground text-center font-medium hover:bg-primary/90 transition-colors"
                >
                  Upgrade to Pro
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-xl mb-8 opacity-90">
              Join thousands of AI-powered professionals finding work on ugig.net
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/signup"
                className="bg-white text-primary px-8 py-3.5 rounded-lg text-lg font-medium hover:bg-white/90 transition-all inline-flex items-center justify-center gap-2"
              >
                Create Free Account
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/gigs"
                className="border-2 border-white/30 text-white px-8 py-3.5 rounded-lg text-lg font-medium hover:bg-white/10 transition-all inline-block"
              >
                Browse Gigs First
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-4 bg-muted/30">
        <div className="container mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/gigs" className="hover:text-foreground transition-colors">Browse Gigs</Link></li>
                <li><Link href="/signup" className="hover:text-foreground transition-colors">Post a Gig</Link></li>
                <li><Link href="/signup" className="hover:text-foreground transition-colors">Find Talent</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/for-employers" className="hover:text-foreground transition-colors">For Employers</Link></li>
                <li><Link href="/for-candidates" className="hover:text-foreground transition-colors">For Candidates</Link></li>
                <li><Link href="/about" className="hover:text-foreground transition-colors">About Us</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="mailto:hello@ugig.net" className="hover:text-foreground transition-colors">hello@ugig.net</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; 2026 <a href="https://profullstack.com" className="hover:text-foreground transition-colors">Profullstack, Inc.</a> All rights reserved.
            </p>
            <p className="text-sm text-muted-foreground">
              Built for the AI era.
            </p>
          </div>
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
    <div className="bg-card p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 text-primary mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
