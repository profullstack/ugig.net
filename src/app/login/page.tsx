import { LoginForm } from "@/components/auth";
import Link from "next/link";

export const metadata = {
  title: "Login | ugig.net",
  description: "Sign in to your ugig.net account",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="text-3xl font-bold text-primary">
            ugig.net
          </Link>
          <h1 className="mt-6 text-2xl font-bold">Welcome back</h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to your account to continue
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
