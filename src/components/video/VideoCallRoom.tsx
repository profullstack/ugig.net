"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, PhoneOff, Video, VideoOff, Mic, MicOff } from "lucide-react";

interface VideoCallRoomProps {
  roomId: string;
  displayName: string;
  onLeave?: () => void;
  onStart?: () => void;
  onEnd?: () => void;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: new (domain: string, options: JitsiMeetOptions) => JitsiMeetAPI;
  }
}

interface JitsiMeetOptions {
  roomName: string;
  parentNode: HTMLElement;
  width: string | number;
  height: string | number;
  configOverwrite?: Record<string, unknown>;
  interfaceConfigOverwrite?: Record<string, unknown>;
  userInfo?: {
    displayName: string;
  };
}

interface JitsiMeetAPI {
  dispose: () => void;
  executeCommand: (command: string, ...args: unknown[]) => void;
  addEventListener: (event: string, listener: (data: unknown) => void) => void;
  isAudioMuted: () => Promise<boolean>;
  isVideoMuted: () => Promise<boolean>;
}

export function VideoCallRoom({
  roomId,
  displayName,
  onLeave,
  onStart,
  onEnd,
}: VideoCallRoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiMeetAPI | null>(null);
  const hasStartedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  // Stable callback refs to avoid re-initializing Jitsi on prop changes
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  const onLeaveRef = useRef(onLeave);

  useEffect(() => {
    onStartRef.current = onStart;
    onEndRef.current = onEnd;
    onLeaveRef.current = onLeave;
  });

  useEffect(() => {
    // Load Jitsi Meet External API script
    const loadScript = () => {
      return new Promise<void>((resolve, reject) => {
        if (window.JitsiMeetExternalAPI) {
          resolve();
          return;
        }

        const script = document.createElement("script");
        script.src = "https://meet.jit.si/external_api.js";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Jitsi Meet API"));
        document.body.appendChild(script);
      });
    };

    const initJitsi = async () => {
      try {
        await loadScript();

        if (!containerRef.current) return;

        const api = new window.JitsiMeetExternalAPI("meet.jit.si", {
          roomName: roomId,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableDeepLinking: true,
            prejoinPageEnabled: false,
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: [
              "microphone",
              "camera",
              "desktop",
              "fullscreen",
              "fodeviceselection",
              "chat",
              "settings",
              "raisehand",
              "videoquality",
              "tileview",
            ],
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            MOBILE_APP_PROMO: false,
            BRAND_WATERMARK_LINK: "",
            SHOW_POWERED_BY: false,
          },
          userInfo: {
            displayName,
          },
        });

        apiRef.current = api;

        api.addEventListener("videoConferenceJoined", () => {
          setIsLoading(false);
          if (!hasStartedRef.current) {
            hasStartedRef.current = true;
            onStartRef.current?.();
          }
        });

        api.addEventListener("videoConferenceLeft", () => {
          onEndRef.current?.();
          onLeaveRef.current?.();
        });

        api.addEventListener("audioMuteStatusChanged", (data: unknown) => {
          const { muted } = data as { muted: boolean };
          setIsAudioMuted(muted);
        });

        api.addEventListener("videoMuteStatusChanged", (data: unknown) => {
          const { muted } = data as { muted: boolean };
          setIsVideoMuted(muted);
        });

        api.addEventListener("readyToClose", () => {
          onLeaveRef.current?.();
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to initialize video call");
        setIsLoading(false);
      }
    };

    initJitsi();

    return () => {
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [roomId, displayName]);

  const toggleAudio = () => {
    apiRef.current?.executeCommand("toggleAudio");
  };

  const toggleVideo = () => {
    apiRef.current?.executeCommand("toggleVideo");
  };

  const hangUp = () => {
    apiRef.current?.executeCommand("hangup");
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <div className="text-destructive text-lg font-medium">
          Failed to join video call
        </div>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={onLeave} variant="outline">
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Connecting to video call...</p>
          </div>
        </div>
      )}

      {/* Jitsi container */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Custom controls overlay */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 z-20">
        <Button
          variant={isAudioMuted ? "destructive" : "secondary"}
          size="icon"
          onClick={toggleAudio}
          className="rounded-full h-12 w-12"
          title={isAudioMuted ? "Unmute" : "Mute"}
        >
          {isAudioMuted ? (
            <MicOff className="h-5 w-5" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </Button>

        <Button
          variant={isVideoMuted ? "destructive" : "secondary"}
          size="icon"
          onClick={toggleVideo}
          className="rounded-full h-12 w-12"
          title={isVideoMuted ? "Turn on camera" : "Turn off camera"}
        >
          {isVideoMuted ? (
            <VideoOff className="h-5 w-5" />
          ) : (
            <Video className="h-5 w-5" />
          )}
        </Button>

        <Button
          variant="destructive"
          size="icon"
          onClick={hangUp}
          className="rounded-full h-12 w-12"
          title="Leave call"
        >
          <PhoneOff className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
