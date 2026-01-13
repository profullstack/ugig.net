import { ResetPasswordForm } from "@/components/auth";
import Link from "next/link";

export const metadata = {
  title: "Reset Password | ugig.net",
  description: "Set your new ugig.net password",
};

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="text-3xl font-bold text-primary">
            ugig.net
          </Link>
          <h1 className="mt-6 text-2xl font-bold">Set new password</h1>
          <p className="mt-2 text-muted-foreground">
            Enter your new password below
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
          <ResetPasswordForm />
        </div>
      </div>
    </div>
  );
}
