"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AgentLoginForm() {
  const router = useRouter();
  const [passportId, setPassportId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/agentpass-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passportId: passportId.trim(), privateKey: privateKey.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Authentication failed");
        setIsLoading(false);
        return;
      }

      // Redirect to magic link confirm URL to establish session
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="passportId">Passport ID</Label>
        <Input
          id="passportId"
          type="text"
          placeholder="ap_a622a643aa71"
          value={passportId}
          onChange={(e) => setPassportId(e.target.value)}
          disabled={isLoading}
          required
        />
        <p className="text-xs text-muted-foreground">
          Your AgentPass passport identifier
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="privateKey">Private Key</Label>
        <Input
          id="privateKey"
          type="password"
          placeholder="Your AgentPass private key"
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          disabled={isLoading}
          required
        />
        <p className="text-xs text-muted-foreground">
          Used to sign the authentication request. Never stored.
        </p>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Signing in..." : "Sign In with AgentPass"}
      </Button>
    </form>
  );
}
