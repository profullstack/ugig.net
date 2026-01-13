import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { VideoCallRoom } from "./VideoCallRoom";

// Mock Jitsi Meet API as a class
const mockDispose = vi.fn();
const mockExecuteCommand = vi.fn();
const mockAddEventListener = vi.fn();
const mockIsAudioMuted = vi.fn().mockResolvedValue(false);
const mockIsVideoMuted = vi.fn().mockResolvedValue(false);

class MockJitsiMeetExternalAPI {
  dispose = mockDispose;
  executeCommand = mockExecuteCommand;
  addEventListener = mockAddEventListener;
  isAudioMuted = mockIsAudioMuted;
  isVideoMuted = mockIsVideoMuted;

  constructor(_domain: string, _options: Record<string, unknown>) {
    // Store for verification
  }
}

describe("VideoCallRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up the mock on window
    (window as unknown as { JitsiMeetExternalAPI: typeof MockJitsiMeetExternalAPI }).JitsiMeetExternalAPI = MockJitsiMeetExternalAPI;
  });

  afterEach(() => {
    // Clean up
    delete (window as unknown as { JitsiMeetExternalAPI?: typeof MockJitsiMeetExternalAPI }).JitsiMeetExternalAPI;
  });

  it("renders loading state initially", () => {
    render(<VideoCallRoom roomId="test-room" displayName="Test User" />);

    expect(screen.getByText("Connecting to video call...")).toBeInTheDocument();
  });

  it("renders control buttons", async () => {
    render(<VideoCallRoom roomId="test-room" displayName="Test User" />);

    // Wait for Jitsi to be initialized
    await waitFor(() => {
      expect(mockAddEventListener).toHaveBeenCalled();
    });

    // Control buttons should always be visible
    expect(screen.getByTitle("Mute")).toBeInTheDocument();
    expect(screen.getByTitle("Turn off camera")).toBeInTheDocument();
    expect(screen.getByTitle("Leave call")).toBeInTheDocument();
  });

  it("registers event listeners", async () => {
    render(<VideoCallRoom roomId="test-room" displayName="Test User" />);

    await waitFor(() => {
      expect(mockAddEventListener).toHaveBeenCalledWith(
        "videoConferenceJoined",
        expect.any(Function)
      );
      expect(mockAddEventListener).toHaveBeenCalledWith(
        "videoConferenceLeft",
        expect.any(Function)
      );
      expect(mockAddEventListener).toHaveBeenCalledWith(
        "audioMuteStatusChanged",
        expect.any(Function)
      );
      expect(mockAddEventListener).toHaveBeenCalledWith(
        "videoMuteStatusChanged",
        expect.any(Function)
      );
    });
  });

  it("toggles audio when mute button is clicked", async () => {
    render(<VideoCallRoom roomId="test-room" displayName="Test User" />);

    await waitFor(() => {
      expect(mockAddEventListener).toHaveBeenCalled();
    });

    const muteButton = screen.getByTitle("Mute");
    fireEvent.click(muteButton);

    expect(mockExecuteCommand).toHaveBeenCalledWith("toggleAudio");
  });

  it("toggles video when camera button is clicked", async () => {
    render(<VideoCallRoom roomId="test-room" displayName="Test User" />);

    await waitFor(() => {
      expect(mockAddEventListener).toHaveBeenCalled();
    });

    const cameraButton = screen.getByTitle("Turn off camera");
    fireEvent.click(cameraButton);

    expect(mockExecuteCommand).toHaveBeenCalledWith("toggleVideo");
  });

  it("hangs up when leave button is clicked", async () => {
    render(<VideoCallRoom roomId="test-room" displayName="Test User" />);

    await waitFor(() => {
      expect(mockAddEventListener).toHaveBeenCalled();
    });

    const leaveButton = screen.getByTitle("Leave call");
    fireEvent.click(leaveButton);

    expect(mockExecuteCommand).toHaveBeenCalledWith("hangup");
  });

  it("calls onStart when conference is joined", async () => {
    const onStart = vi.fn();
    render(
      <VideoCallRoom
        roomId="test-room"
        displayName="Test User"
        onStart={onStart}
      />
    );

    await waitFor(() => {
      expect(mockAddEventListener).toHaveBeenCalled();
    });

    // Find and call the videoConferenceJoined callback
    const joinedCall = mockAddEventListener.mock.calls.find(
      (call) => call[0] === "videoConferenceJoined"
    );

    if (joinedCall && joinedCall[1]) {
      act(() => {
        joinedCall[1]({});
      });
    }

    expect(onStart).toHaveBeenCalled();
  });

  it("calls onLeave and onEnd when conference is left", async () => {
    const onLeave = vi.fn();
    const onEnd = vi.fn();
    render(
      <VideoCallRoom
        roomId="test-room"
        displayName="Test User"
        onLeave={onLeave}
        onEnd={onEnd}
      />
    );

    await waitFor(() => {
      expect(mockAddEventListener).toHaveBeenCalled();
    });

    // Find and call the videoConferenceLeft callback
    const leftCall = mockAddEventListener.mock.calls.find(
      (call) => call[0] === "videoConferenceLeft"
    );

    if (leftCall && leftCall[1]) {
      act(() => {
        leftCall[1]({});
      });
    }

    expect(onEnd).toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalled();
  });

  it("disposes Jitsi on unmount", async () => {
    const { unmount } = render(
      <VideoCallRoom roomId="test-room" displayName="Test User" />
    );

    await waitFor(() => {
      expect(mockAddEventListener).toHaveBeenCalled();
    });

    unmount();

    expect(mockDispose).toHaveBeenCalled();
  });

  it("updates mute button state when audio is muted", async () => {
    render(<VideoCallRoom roomId="test-room" displayName="Test User" />);

    await waitFor(() => {
      expect(mockAddEventListener).toHaveBeenCalled();
    });

    // Find and call the audioMuteStatusChanged callback
    const audioMuteCall = mockAddEventListener.mock.calls.find(
      (call) => call[0] === "audioMuteStatusChanged"
    );

    if (audioMuteCall && audioMuteCall[1]) {
      act(() => {
        audioMuteCall[1]({ muted: true });
      });
    }

    await waitFor(() => {
      expect(screen.getByTitle("Unmute")).toBeInTheDocument();
    });
  });

  it("updates video button state when video is muted", async () => {
    render(<VideoCallRoom roomId="test-room" displayName="Test User" />);

    await waitFor(() => {
      expect(mockAddEventListener).toHaveBeenCalled();
    });

    // Find and call the videoMuteStatusChanged callback
    const videoMuteCall = mockAddEventListener.mock.calls.find(
      (call) => call[0] === "videoMuteStatusChanged"
    );

    if (videoMuteCall && videoMuteCall[1]) {
      act(() => {
        videoMuteCall[1]({ muted: true });
      });
    }

    await waitFor(() => {
      expect(screen.getByTitle("Turn on camera")).toBeInTheDocument();
    });
  });
});
