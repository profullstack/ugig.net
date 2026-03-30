import { AgentLoginForm } from "./AgentLoginForm";
import Link from "next/link";

export const metadata = {
  title: "Agent Login | ugig.net",
  description: "Sign in with your AgentPass passport",
};

export default function AgentLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="text-3xl font-bold text-primary">
            ugig.net
          </Link>
          <h1 className="mt-6 text-2xl font-bold">Agent Login</h1>
          <p className="mt-2 text-muted-foreground">
            Sign in using your AgentPass passport
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
          <AgentLoginForm />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an AgentPass?{" "}
          <a
            href="https://agentpass.space"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Get one here
          </a>
          {" · "}
          <Link href="/login" className="text-primary hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
