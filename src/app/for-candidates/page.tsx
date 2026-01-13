import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/layout/Header";
import {
  ArrowRight,
  Check,
  Briefcase,
  DollarSign,
  Eye,
  MessageSquare,
  Rocket,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
  Video,
  Zap,
} from "lucide-react";

export const metadata = {
  title: "For Candidates | ugig.net",
  description: "Find freelance gigs that value your AI skills. Showcase your toolkit and land better opportunities.",
};

export default function ForCandidatesPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-20 px-4 bg-gradient-to-b from-primary/5 to-transparent">
          <div className="container mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Sparkles className="h-4 w-4" />
              For Candidates
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
              Your <span className="text-primary">AI Skills</span> Are Your Superpower
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Finally, a platform that values your AI expertise. Showcase the tools you use
              and find gigs that appreciate modern professionals.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup">
                <Button size="lg" className="text-lg px-8 shadow-lg shadow-primary/25">
                  Create Your Profile
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>
              <Link href="/gigs">
                <Button variant="outline" size="lg" className="text-lg px-8">
                  Browse Open Gigs
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-20 px-4">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">Why Join ugig.net?</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Built for professionals who leverage AI to do their best work.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              <BenefitCard
                icon={<Zap className="h-6 w-6" />}
                title="Showcase Your AI Toolkit"
                description="Highlight ChatGPT, Copilot, Claude, Midjourney, and other AI tools you use. Employers actively seek AI-savvy talent."
              />
              <BenefitCard
                icon={<Eye className="h-6 w-6" />}
                title="Public Profile"
                description="Your profile is visible to employers even before they sign up. Maximum exposure for your skills."
              />
              <BenefitCard
                icon={<Briefcase className="h-6 w-6" />}
                title="Quality Gigs"
                description="Find opportunities from employers who understand and value AI-augmented work."
              />
              <BenefitCard
                icon={<DollarSign className="h-6 w-6" />}
                title="Crypto Payments"
                description="Get paid in cryptocurrency including USDC, ETH, BTC, and more. Fast, global payments."
              />
              <BenefitCard
                icon={<Video className="h-6 w-6" />}
                title="Built-in Video Calls"
                description="Interview with potential clients directly on the platform. No need for external tools."
              />
              <BenefitCard
                icon={<MessageSquare className="h-6 w-6" />}
                title="Direct Communication"
                description="Message employers directly. Discuss project details and negotiate terms in real-time."
              />
            </div>
          </div>
        </section>

        {/* Stand Out Section */}
        <section className="py-20 px-4 bg-muted/50">
          <div className="container mx-auto max-w-5xl">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold mb-6">Stand Out From the Crowd</h2>
                <p className="text-muted-foreground mb-6">
                  Traditional freelance platforms don&apos;t differentiate between those who use AI
                  and those who don&apos;t. On ugig.net, your AI expertise is front and center.
                </p>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <div className="mt-1 p-1 rounded-full bg-green-500/10">
                      <Check className="h-4 w-4 text-green-500" />
                    </div>
                    <div>
                      <strong>AI Tools Section</strong>
                      <p className="text-sm text-muted-foreground">List every AI tool you&apos;re proficient with</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-1 p-1 rounded-full bg-green-500/10">
                      <Check className="h-4 w-4 text-green-500" />
                    </div>
                    <div>
                      <strong>Skills + AI Pairing</strong>
                      <p className="text-sm text-muted-foreground">Show how you combine traditional skills with AI</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-1 p-1 rounded-full bg-green-500/10">
                      <Check className="h-4 w-4 text-green-500" />
                    </div>
                    <div>
                      <strong>Work History</strong>
                      <p className="text-sm text-muted-foreground">Showcase your experience and past projects</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-1 p-1 rounded-full bg-green-500/10">
                      <Check className="h-4 w-4 text-green-500" />
                    </div>
                    <div>
                      <strong>Portfolio Links</strong>
                      <p className="text-sm text-muted-foreground">Link to your best work and projects</p>
                    </div>
                  </li>
                </ul>
              </div>
              <div className="bg-card p-8 rounded-xl border border-border shadow-lg">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Star className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Pro Candidate</h3>
                    <p className="text-sm text-muted-foreground">Featured profile badge</p>
                  </div>
                </div>
                <div className="space-y-3 mb-6">
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm">ChatGPT</span>
                    <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm">Claude</span>
                    <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm">Copilot</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-muted rounded-full text-sm">React</span>
                    <span className="px-3 py-1 bg-muted rounded-full text-sm">TypeScript</span>
                    <span className="px-3 py-1 bg-muted rounded-full text-sm">Node.js</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground italic">
                  &quot;Employers see exactly what AI tools you use and how you combine them with your core skills.&quot;
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">How It Works</h2>
              <p className="text-muted-foreground">Get started in minutes and start applying today</p>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
              <StepCard
                number="1"
                title="Create Profile"
                description="Add your skills, AI tools, and work history"
              />
              <StepCard
                number="2"
                title="Browse Gigs"
                description="Find opportunities that match your expertise"
              />
              <StepCard
                number="3"
                title="Apply"
                description="Submit applications with your profile"
              />
              <StepCard
                number="4"
                title="Get Hired"
                description="Interview, collaborate, and get paid"
              />
            </div>
          </div>
        </section>

        {/* Free Forever */}
        <section className="py-20 px-4 bg-muted/50">
          <div className="container mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 text-green-500 mb-6">
              <Rocket className="h-8 w-8" />
            </div>
            <h2 className="text-3xl font-bold mb-4">Free Forever for Candidates</h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Browsing gigs and applying is always free. Create your profile, apply to unlimited gigs,
              message employers, and do video calls &mdash; all without paying a cent.
            </p>
            <ul className="inline-flex flex-wrap justify-center gap-4 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Unlimited applications
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Free messaging
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Free video calls
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Public profile
              </li>
            </ul>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Showcase Your AI Skills?</h2>
            <p className="text-xl mb-8 opacity-90">
              Create your free profile and start applying to gigs today.
            </p>
            <Link href="/signup">
              <Button size="lg" variant="secondary" className="text-lg px-8">
                Create Free Profile
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} ugig.net. All rights reserved.
          </p>
          <nav className="flex gap-6 text-sm text-muted-foreground">
            <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link href="/for-employers" className="hover:text-foreground transition-colors">For Employers</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function BenefitCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground text-xl font-bold flex items-center justify-center mx-auto mb-4">
        {number}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
