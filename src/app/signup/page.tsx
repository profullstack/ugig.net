import { SignupForm } from "@/components/auth";
import Link from "next/link";

export const metadata = {
  title: "Sign Up | ugig.net",
  description: "Create your ugig.net account",
};

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="text-3xl font-bold text-primary">
            ugig.net
          </Link>
          <h1 className="mt-6 text-2xl font-bold">Create an account</h1>
          <p className="mt-2 text-muted-foreground">
            Join the marketplace for AI-assisted professionals
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
          <SignupForm />
        </div>
      </div>
    </div>
  );
}
