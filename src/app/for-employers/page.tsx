import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/layout/Header";
import {
  ArrowRight,
  Check,
  Clock,
  DollarSign,
  MessageSquare,
  Search,
  Shield,
  Sparkles,
  Users,
  Video,
  Zap,
} from "lucide-react";

export const metadata = {
  title: "For Employers | ugig.net",
  description: "Hire AI-powered professionals on ugig.net. Find skilled freelancers who leverage AI tools to deliver faster results.",
};

export default function ForEmployersPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-20 px-4 bg-gradient-to-b from-primary/5 to-transparent">
          <div className="container mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Users className="h-4 w-4" />
              For Employers
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
              Hire <span className="text-primary">AI-Powered</span> Talent That Delivers Faster
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Find skilled professionals who use AI tools to work smarter, not harder.
              Get better results in less time.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup">
                <Button size="lg" className="text-lg px-8 shadow-lg shadow-primary/25">
                  Post a Gig Free
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>
              <Link href="/gigs">
                <Button variant="outline" size="lg" className="text-lg px-8">
                  Browse Talent
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-20 px-4">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">Why Hire on ugig.net?</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Our platform is built specifically for the AI era, connecting you with professionals who maximize productivity.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              <BenefitCard
                icon={<Zap className="h-6 w-6" />}
                title="AI-Augmented Talent"
                description="Every candidate showcases their AI toolkit. Know exactly which tools they use to boost productivity."
              />
              <BenefitCard
                icon={<Clock className="h-6 w-6" />}
                title="Faster Turnaround"
                description="AI-powered professionals complete projects faster without sacrificing quality. Get results in days, not weeks."
              />
              <BenefitCard
                icon={<DollarSign className="h-6 w-6" />}
                title="Cost Effective"
                description="Post unlimited gigs for free. Only upgrade to Pro when you need advanced features."
              />
              <BenefitCard
                icon={<Video className="h-6 w-6" />}
                title="Built-in Video Calls"
                description="Interview candidates directly on the platform. No need for external video conferencing tools."
              />
              <BenefitCard
                icon={<MessageSquare className="h-6 w-6" />}
                title="Direct Messaging"
                description="Communicate with candidates in real-time. Discuss project details and negotiate terms easily."
              />
              <BenefitCard
                icon={<Shield className="h-6 w-6" />}
                title="Verified Profiles"
                description="Review detailed profiles with skills, work history, and AI tools before making hiring decisions."
              />
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4 bg-muted/50">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">How It Works</h2>
              <p className="text-muted-foreground">Post a gig and start receiving applications in minutes</p>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
              <StepCard
                number="1"
                title="Create Account"
                description="Sign up in 30 seconds with just your email"
              />
              <StepCard
                number="2"
                title="Post Your Gig"
                description="Describe the project, skills needed, and budget"
              />
              <StepCard
                number="3"
                title="Review Applications"
                description="Browse candidate profiles and AI tool expertise"
              />
              <StepCard
                number="4"
                title="Hire & Collaborate"
                description="Message, video call, and work together on platform"
              />
            </div>
          </div>
        </section>

        {/* What You Get */}
        <section className="py-20 px-4">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">What&apos;s Included</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-card p-8 rounded-xl border border-border">
                <h3 className="text-xl font-bold mb-2">Free Plan</h3>
                <p className="text-3xl font-bold mb-6">$0<span className="text-lg font-normal text-muted-foreground">/month</span></p>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Post up to 10 gigs per month</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Unlimited applications received</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Direct messaging with candidates</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Video interviews</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Access to all candidate profiles</span>
                  </li>
                </ul>
              </div>

              <div className="bg-card p-8 rounded-xl border-2 border-primary relative">
                <span className="absolute -top-3 left-4 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium">
                  Pro
                </span>
                <h3 className="text-xl font-bold mb-2">Pro Plan</h3>
                <p className="text-3xl font-bold mb-1">$9<span className="text-lg font-normal text-muted-foreground">/month</span></p>
                <p className="text-sm text-muted-foreground mb-6">billed annually, or $29/mo</p>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Everything in Free</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span><strong>Unlimited</strong> gig posts</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Featured gig placement</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Priority support</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Advanced analytics</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Find AI-Powered Talent?</h2>
            <p className="text-xl mb-8 opacity-90">
              Post your first gig for free and start receiving applications today.
            </p>
            <Link href="/signup">
              <Button size="lg" variant="secondary" className="text-lg px-8">
                Post a Gig Free
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
            &copy; 2026 <a href="https://profullstack.com" className="hover:text-foreground transition-colors">Profullstack, Inc.</a> All rights reserved.
          </p>
          <nav className="flex gap-6 text-sm text-muted-foreground">
            <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link href="/for-candidates" className="hover:text-foreground transition-colors">For Candidates</Link>
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
