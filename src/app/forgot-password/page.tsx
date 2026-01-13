import { ForgotPasswordForm } from "@/components/auth";
import Link from "next/link";

export const metadata = {
  title: "Forgot Password | ugig.net",
  description: "Reset your ugig.net password",
};

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="text-3xl font-bold text-primary">
            ugig.net
          </Link>
          <h1 className="mt-6 text-2xl font-bold">Reset your password</h1>
          <p className="mt-2 text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
