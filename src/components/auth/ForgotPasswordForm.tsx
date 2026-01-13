"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validations";
import { auth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordInput) => {
    setIsLoading(true);
    setError(null);

    const result = await auth.forgotPassword(data);

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    setSuccess(true);
    setIsLoading(false);
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="p-4 bg-primary/10 rounded-lg">
          <h3 className="font-semibold text-primary">Check your email</h3>
          <p className="text-sm text-muted-foreground mt-2">
            If an account exists with this email, you&apos;ll receive a password
            reset link shortly.
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
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}

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

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Sending..." : "Send Reset Link"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Remember your password?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
