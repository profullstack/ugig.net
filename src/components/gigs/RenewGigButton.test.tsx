import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockRefresh = vi.fn();
const mockRenew = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));
vi.mock("@/lib/api", () => ({
  gigs: { renew: (...args: unknown[]) => mockRenew(...args) },
}));

import { RenewGigButton } from "./RenewGigButton";

describe("RenewGigButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing for a gig that has not expired", () => {
    const { container } = render(<RenewGigButton gigId="g1" days={30} expired={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the renew window and anchors #renew", () => {
    const { container } = render(<RenewGigButton gigId="g1" days={60} expired />);
    expect(screen.getByRole("button", { name: /renew for 60 days/i })).toBeInTheDocument();
    expect(container.querySelector("#renew")).not.toBeNull();
  });

  it("renews and refreshes", async () => {
    mockRenew.mockResolvedValue({ data: {} });
    render(<RenewGigButton gigId="g1" days={30} expired />);
    fireEvent.click(screen.getByRole("button", { name: /renew for 30 days/i }));
    await waitFor(() => expect(mockRenew).toHaveBeenCalledWith("g1"));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("shows the API error (e.g. the ad cap) and does not refresh", async () => {
    mockRenew.mockResolvedValue({ error: "You already have 50 active for-hire ads" });
    render(<RenewGigButton gigId="g1" days={60} expired />);
    fireEvent.click(screen.getByRole("button", { name: /renew/i }));
    expect(await screen.findByText(/50 active for-hire ads/)).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
