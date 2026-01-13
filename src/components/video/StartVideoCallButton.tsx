"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Video, Loader2 } from "lucide-react";
import { videoCalls } from "@/lib/api";

interface StartVideoCallButtonProps {
  participantId: string;
  gigId?: string;
  applicationId?: string;
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function StartVideoCallButton({
  participantId,
  gigId,
  applicationId,
  variant = "outline",
  size = "sm",
  className,
}: StartVideoCallButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleStartCall = async () => {
    setIsLoading(true);
    try {
      const result = await videoCalls.create({
        participant_id: participantId,
        gig_id: gigId,
        application_id: applicationId,
      });

      if (result.error) {
        console.error("Failed to create video call:", result.error);
        return;
      }

      const call = result.data as { data: { id: string } };
      router.push(`/dashboard/calls/${call.data.id}`);
    } catch (error) {
      console.error("Error starting video call:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleStartCall}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Video className="h-4 w-4 mr-2" />
          Video Call
        </>
      )}
    </Button>
  );
}
