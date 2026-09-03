import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

const USER_ID = "user-1";
const CONVERSATION_ID = "conv-1";

const unsubscribe = vi.fn();
const disconnect = vi.fn();
const channelFactory = vi.fn();

function makeSupabase() {
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe,
  };

  channelFactory.mockReturnValue(channel);

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi
            .fn()
            .mockResolvedValue({ data: { participant_ids: [USER_ID] } }),
        })),
      })),
    })),
    channel: channelFactory,
    realtime: { disconnect },
  };
}

/**
 * A request whose abort signal we control.
 *
 * The leak this route had turns on *when* the signal aborts relative to the
 * awaits in the handler, so the signal has to be steerable rather than real.
 */
function makeRequest(signal: {
  aborted: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}) {
  const request = new NextRequest(
    `http://localhost/api/conversations/${CONVERSATION_ID}/stream`
  );
  Object.defineProperty(request, "signal", { get: () => signal });
  return request;
}

function makeSignal(aborted = false) {
  return {
    aborted,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

const params = Promise.resolve({ id: CONVERSATION_ID });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthContext).mockResolvedValue({
    user: { id: USER_ID, authMethod: "session" },
    supabase: makeSupabase() as any,
  });
});

describe("GET /api/conversations/[id]/stream", () => {
  it("never opens a channel when the client has already gone away", async () => {
    // The client disconnected while the auth and conversation lookups were
    // still awaiting. Registering an abort listener at this point would never
    // fire, so anything subscribed here would run for the life of the process.
    const signal = makeSignal(true);

    const response = await GET(makeRequest(signal), { params });

    expect(response.status).toBe(200);
    expect(channelFactory).not.toHaveBeenCalled();
    expect(signal.addEventListener).not.toHaveBeenCalled();
  });

  it("subscribes when the client is still connected", async () => {
    const signal = makeSignal(false);

    await GET(makeRequest(signal), { params });

    expect(channelFactory).toHaveBeenCalledWith(`messages:${CONVERSATION_ID}`);
    expect(signal.addEventListener).toHaveBeenCalledWith(
      "abort",
      expect.any(Function)
    );
  });

  it("releases the channel and the socket when the stream is cancelled", async () => {
    // Cancellation does not always coincide with the request signal aborting,
    // and before this route had a cancel() handler it was the path that kept
    // its channel.
    const signal = makeSignal(false);

    const response = await GET(makeRequest(signal), { params });
    await response.body?.cancel();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("cleans up once, however many times it is asked to", async () => {
    const signal = makeSignal(false);

    const response = await GET(makeRequest(signal), { params });

    // The abort listener the route registered, invoked directly.
    const onAbort = signal.addEventListener.mock.calls[0]?.[1] as () => void;
    onAbort();
    onAbort();
    await response.body?.cancel();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(signal.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
