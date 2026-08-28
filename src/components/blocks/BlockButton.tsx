"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Ban, Loader2, ShieldOff } from "lucide-react";

interface BlockButtonProps {
  username: string;
  initialBlocked?: boolean;
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  /** Called after a successful block/unblock instead of refreshing the route. */
  onChange?: (blocked: boolean) => void;
}

export function BlockButton({
  username,
  initialBlocked = false,
  variant = "ghost",
  size = "sm",
  className,
  onChange,
}: BlockButtonProps) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(initialBlocked);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (nextBlocked: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/users/${encodeURIComponent(username)}/block`,
        { method: nextBlocked ? "POST" : "DELETE" }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Something went wrong");
        return;
      }

      setBlocked(nextBlocked);
      setConfirming(false);

      if (onChange) {
        onChange(nextBlocked);
      } else {
        router.refresh();
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (blocked) {
    return (
      <div className={className}>
        <Button
          variant="outline"
          size={size}
          onClick={() => submit(false)}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <ShieldOff className="h-4 w-4 mr-1" />
          )}
          Unblock
        </Button>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
    );
  }

  if (!confirming) {
    return (
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setConfirming(true)}
        aria-label={`Block ${username}`}
      >
        <Ban className="h-4 w-4 mr-1" />
        Block
      </Button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Block ${username}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !loading && setConfirming(false)}
    >
      <div
        className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Block @{username}?</h2>
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground list-disc pl-5">
          <li>You will not see their posts in your feed.</li>
          <li>Neither of you can message the other.</li>
          <li>Any follows between you are removed.</li>
          <li>You can unblock them at any time from their profile or settings.</li>
        </ul>
        {error && <p className="text-sm text-destructive mt-3">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirming(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => submit(true)}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Ban className="h-4 w-4 mr-1" />
            )}
            Block
          </Button>
        </div>
      </div>
    </div>
  );
}
