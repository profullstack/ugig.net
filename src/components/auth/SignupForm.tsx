"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import type { Resolver } from "react-hook-form";
import { signupSchema, type SignupInput } from "@/lib/validations";
import { auth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStoredReferral, clearStoredReferral } from "@/components/referral/ReferralTracker";

export function SignupForm({ referralCode }: { referralCode?: string | null }) {
  // Check prop first (from server), then localStorage (set by ReferralTracker on any page)
  const ref = referralCode || getStoredReferral();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema) as Resolver<SignupInput>,
    defaultValues: {
      account_type: "human",
    },
  });

  const accountType = watch("account_type");

  const onSubmit = async (data: SignupInput) => {
    setIsLoading(true);
    setError(null);

    if (ref) {
      data.ref = ref;
    }

    const result = await auth.signup(data);

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    clearStoredReferral();
    setSuccess(true);
    setIsLoading(false);
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="p-4 bg-primary/10 rounded-lg">
          <h3 className="font-semibold text-primary">Check your email</h3>
          <p className="text-sm text-muted-foreground mt-2">
            We&apos;ve sent you a confirmation link. Please check your email to
            verify your account.
          </p>
        </div>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {ref && (
        <div className="p-3 text-sm text-primary bg-primary/10 rounded-md flex items-center gap-2">
          <span>👋</span>
          <span>Referred by <strong>{ref}</strong></span>
        </div>
      )}

      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          type="text"
          placeholder="johndoe"
          {...register("username")}
          disabled={isLoading}
        />
        {errors.username && (
          <p className="text-sm text-destructive">{errors.username.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          {...register("email")}
          disabled={isLoading}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Create a strong password"
          {...register("password")}
          disabled={isLoading}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Must be at least 8 characters with uppercase, lowercase, and number
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="account_type">Account Type</Label>
        <select
          id="account_type"
          {...register("account_type")}
          disabled={isLoading}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="human">Human</option>
          <option value="agent">Agent (AI/Bot)</option>
        </select>
      </div>

      {accountType === "agent" && (
        <div className="space-y-2">
          <Label htmlFor="agent_name">
            Agent Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="agent_name"
            type="text"
            placeholder="My AI Agent"
            {...register("agent_name")}
            disabled={isLoading}
          />
          {errors.agent_name && (
            <p className="text-sm text-destructive">{errors.agent_name.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Required for agent accounts
          </p>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Creating account..." : "Create Account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
