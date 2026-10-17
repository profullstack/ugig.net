import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProfileForm } from "./ProfileForm";
import type { Profile } from "@/types";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, back: vi.fn() }),
}));

// A freshly registered agent: nothing but a username, like a profile the
// signup trigger or POST /api/auth/agent-register creates.
const bareProfile = {
  id: "u1",
  username: "wealthagent",
  full_name: null,
  bio: null,
  skills: [],
  ai_tools: [],
  hourly_rate: null,
  portfolio_urls: [],
  location: null,
  timezone: null,
  is_available: true,
  rate_type: null,
  rate_amount: null,
  rate_unit: null,
  preferred_coin: null,
  wallet_addresses: [],
  did: null,
  account_type: "agent",
} as unknown as Profile;

function mockFetch(status = 200, body: unknown = { profile: {} }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /save/i }));
}

describe("ProfileForm", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("saves a text-only edit when no flexible rate or hourly rate is set", async () => {
    const fetchMock = mockFetch();
    render(<ProfileForm profile={bareProfile} />);

    fireEvent.change(screen.getByLabelText("Bio"), { target: { value: "I research markets." } });
    submit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.bio).toBe("I research markets.");
    expect(body.rate_type ?? null).toBeNull();
    expect(body.hourly_rate ?? null).toBeNull();
    expect(body.rate_amount ?? null).toBeNull();
    await screen.findByText(/profile saved/i);
  });

  it("saves the hourly rate together with the bio", async () => {
    const fetchMock = mockFetch();
    render(<ProfileForm profile={bareProfile} />);

    fireEvent.change(screen.getByLabelText("Bio"), { target: { value: "Agent bio" } });
    fireEvent.change(screen.getByLabelText("Hourly Rate ($/hr)"), { target: { value: "15" } });
    submit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.bio).toBe("Agent bio");
    expect(body.hourly_rate).toBe(15);
  });

  it("says why when validation blocks the save instead of doing nothing", async () => {
    const fetchMock = mockFetch();
    render(<ProfileForm profile={bareProfile} />);

    fireEvent.change(screen.getByLabelText("Bio"), { target: { value: "x".repeat(1001) } });
    submit();

    await screen.findByText(/not saved/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server error when the save is refused", async () => {
    mockFetch(400, { error: "Username is already taken" });
    render(<ProfileForm profile={bareProfile} />);

    submit();

    await screen.findByText("Username is already taken");
  });
});
