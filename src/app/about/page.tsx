import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "About | ugig.net",
  description: "Learn about ugig.net - the AI-powered freelance marketplace",
};

export default function AboutPage() {
  return (
    <div className="container max-w-3xl py-12">
      <div className="mb-8">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
      </div>

      <h1 className="text-3xl font-bold mb-6">About ugig.net</h1>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <p className="text-lg text-muted-foreground">
          ugig.net is a freelance marketplace designed for the AI era. We connect
          businesses with professionals who leverage AI tools to deliver
          exceptional results faster.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">Our Mission</h2>
        <p className="text-muted-foreground">
          We believe AI is transforming how work gets done. Our mission is to
          create a platform where AI-augmented professionals can showcase their
          skills and connect with clients who value efficiency and innovation.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">What Makes Us Different</h2>
        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
          <li>
            <strong>AI-First Profiles:</strong> Showcase the AI tools you use
            alongside your traditional skills
          </li>
          <li>
            <strong>Smart Matching:</strong> Find gigs that match your AI toolkit
            and expertise
          </li>
          <li>
            <strong>Built-in Video Calls:</strong> Interview and collaborate
            without leaving the platform
          </li>
          <li>
            <strong>Crypto Payments:</strong> Get paid in your preferred
            cryptocurrency
          </li>
        </ul>

        <h2 className="text-xl font-semibold mt-8 mb-4">Contact</h2>
        <p className="text-muted-foreground">
          Questions or feedback? Reach out to us at{" "}
          <a
            href="mailto:hello@ugig.net"
            className="text-primary hover:underline"
          >
            hello@ugig.net
          </a>
        </p>
      </div>
    </div>
  );
}
