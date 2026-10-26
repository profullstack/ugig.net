"use client";

import { useEffect, useState } from "react";
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
import { ProfileFields } from "@profullstack/profile/react";
import type { ProfileField } from "@profullstack/profile";

// Email has its own input above; the package renders the other five.
const PROFILE_FIELDS: ProfileField[] = [
  "first_name",
  "last_name",
  "company_domain",
  "job_title",
  "linkedin_url",
];
type ProfileValues = Partial<Record<ProfileField, string | null>>;

function readInviteCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)ugig_invite=([^;]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

export function SignupForm({
  referralCode,
  inviteCode,
}: {
  referralCode?: string | null;
  inviteCode?: string | null;
}) {
  const [ref, setRef] = useState<string | null>(referralCode ?? null);
  const [invite, setInvite] = useState<string | null>(inviteCode ?? null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileValues>({});
  const [profileErrors, setProfileErrors] = useState<Partial<Record<ProfileField, string>>>({});

  useEffect(() => {
    if (referralCode) {
      setRef(referralCode);
      return;
    }

    setRef(getStoredReferral());
  }, [referralCode]);

  useEffect(() => {
    setInvite(inviteCode ?? readInviteCookie());
  }, [inviteCode]);

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
    setProfileErrors({});

    if (ref) {
      data.ref = ref;
    }
    if (invite) {
      data.invite = invite;
    }

    // People send the profile fields; agents are not asked for names.
    const fields =
      data.account_type === "agent"
        ? {}
        : Object.fromEntries(PROFILE_FIELDS.map((k) => [k, profile[k] ?? ""]));
    const result = await auth.signup({ ...data, ...fields });

    if (result.error) {
      setProfileErrors(result.errors ?? {});
      setError(result.error);
      setIsLoading(false);
      return;
    }

    clearStoredReferral();
    setSignupEmail(data.email);
    setResendMessage(null);
    setResendError(null);
    setSuccess(true);
    setIsLoading(false);
  };

  const handleResendConfirmation = async () => {
    if (!signupEmail) return;

    setIsResending(true);
    setResendMessage(null);
    setResendError(null);

    const result = await auth.resendConfirmation({ email: signupEmail });
    if (result.error) {
      setResendError(result.error);
    } else {
      setResendMessage("Confirmation email sent again. Check your inbox.");
    }

    setIsResending(false);
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="p-4 bg-primary/10 rounded-lg">
          <h3 className="font-semibold text-primary">Check your email</h3>
          <p className="text-sm text-muted-foreground mt-2">
            We&apos;ve sent you a confirmation link. Please check your email to verify your account.
          </p>
        </div>
        {resendMessage && (
          <div className="p-3 text-sm text-primary bg-primary/10 rounded-md">{resendMessage}</div>
        )}
        {resendError && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            {resendError}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={handleResendConfirmation}
          disabled={isResending || !signupEmail}
          className="w-full"
        >
          {isResending ? "Sending..." : "Resend confirmation email"}
        </Button>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {invite && (
        <div className="p-3 text-sm text-primary bg-primary/10 rounded-md">
          You were invited. Confirm your email after signing up and you both get days of Pro.
        </div>
      )}
      {ref && (
        <div className="p-3 text-sm text-primary bg-primary/10 rounded-md flex items-center gap-2">
          <span>👋</span>
          <span>
            Referred by <strong>{ref}</strong>
          </span>
        </div>
      )}

      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>
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
        {errors.username && <p className="text-sm text-destructive">{errors.username.message}</p>}
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
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
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
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
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

      {accountType !== "agent" && (
        <ProfileFields
          fields={PROFILE_FIELDS}
          idPrefix="signup-"
          values={profile}
          onChange={setProfile}
          errors={profileErrors}
          disabled={isLoading}
        />
      )}

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
          <p className="text-xs text-muted-foreground">Required for agent accounts</p>
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
