import { LoginForm } from "@/components/auth";
import Link from "next/link";

export const metadata = {
  title: "Login | ugig.net",
  description: "Sign in to your ugig.net account",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const confirmed = params.confirmed === "true";
  const error = typeof params.error === "string" ? params.error : null;
  const detail = typeof params.detail === "string" ? params.detail : null;

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

        {confirmed && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-sm text-green-700 dark:text-green-300">
            ✅ Email confirmed! You can now sign in.
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-700 dark:text-red-300">
            {error === "invalid_confirmation_link"
              ? "Invalid confirmation link. Please request a new one."
              : error === "confirmation_failed"
              ? "Email confirmation failed. The link may have expired."
              : error?.startsWith("coinpay_")
              ? `CoinPay login failed (${error}${detail ? ': ' + detail : ''}). Please try again or use email/password.`
              : "An error occurred. Please try again."}
          </div>
        )}

        <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
          <LoginForm />
          <noscript>
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-700 dark:text-yellow-300">
              JavaScript is required to use the login form. Please enable JavaScript in your browser.
            </div>
          </noscript>
        </div>
      </div>
    </div>
  );
}
