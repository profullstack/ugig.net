"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoCallRoom } from "@/components/video/VideoCallRoom";
import { videoCalls } from "@/lib/api";
import { ArrowLeft, Calendar, Users, Briefcase } from "lucide-react";
import type { Profile, Gig } from "@/types";

interface VideoCallData {
  id: string;
  room_id: string;
  initiator_id: string;
  participant_ids: string[];
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  initiator: Profile;
  participants: Profile[];
  gig?: Pick<Gig, "id" | "title"> | null;
}

export default function VideoCallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [call, setCall] = useState<VideoCallData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; full_name?: string; username: string } | null>(null);

  useEffect(() => {
    async function fetchData() {
      // Fetch current user session
      const sessionRes = await fetch("/api/auth/session");
      const sessionData = await sessionRes.json();
      if (sessionData.user) {
        setCurrentUser({
          id: sessionData.user.id,
          full_name: sessionData.user.user_metadata?.full_name,
          username: sessionData.user.user_metadata?.username || sessionData.user.email?.split("@")[0] || "User",
        });
      }

      // Fetch video call details
      const result = await videoCalls.get(id);
      if (result.error) {
        setError(result.error);
      } else {
        const data = result.data as { data: VideoCallData };
        setCall(data.data);
      }
      setIsLoading(false);
    }

    fetchData();
  }, [id]);

  const handleStart = async () => {
    await videoCalls.start(id);
  };

  const handleEnd = async () => {
    await videoCalls.end(id);
  };

  const handleLeave = () => {
    router.push("/dashboard/messages");
  };

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-8">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="text-center py-12">
          <h2 className="text-lg font-semibold mb-2">Video call not found</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button asChild>
            <Link href="/dashboard/messages">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Messages
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Show call ended state
  if (call.ended_at) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Call Ended</h2>
          <p className="text-muted-foreground mb-4">
            This video call has ended.
          </p>
          <Button asChild>
            <Link href="/dashboard/messages">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Messages
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Get display name for Jitsi
  const displayName = currentUser?.full_name || currentUser?.username || "User";

  // Get other participant info
  const otherParticipants = call.participants.filter(
    (p) => p.id !== currentUser?.id
  );
  const otherNames = otherParticipants
    .map((p) => p.full_name || p.username)
    .join(", ");

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/messages">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Call with {otherNames || "Participant"}
            </h1>
            {call.gig && (
              <Link
                href={`/gigs/${call.gig.id}`}
                className="text-sm text-muted-foreground hover:underline flex items-center gap-1"
              >
                <Briefcase className="h-3 w-3" />
                {call.gig.title}
              </Link>
            )}
          </div>
        </div>
        {call.scheduled_at && !call.started_at && (
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            Scheduled: {new Date(call.scheduled_at).toLocaleString()}
          </div>
        )}
      </div>

      {/* Video call room */}
      <div className="flex-1">
        <VideoCallRoom
          roomId={call.room_id}
          displayName={displayName}
          onStart={handleStart}
          onEnd={handleEnd}
          onLeave={handleLeave}
        />
      </div>
    </div>
  );
}
