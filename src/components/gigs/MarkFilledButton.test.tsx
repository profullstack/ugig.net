import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockConfirm = vi.fn().mockResolvedValue(true);
vi.mock("@/components/providers/DialogProvider", () => ({
  useDialog: () => ({ confirm: mockConfirm, alert: vi.fn() }),
}));

const mockRefresh = vi.fn();
const mockUpdateStatus = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));
vi.mock("@/lib/api", () => ({
  gigs: { updateStatus: (...args: unknown[]) => mockUpdateStatus(...args) },
}));

import { MarkFilledButton } from "./MarkFilledButton";

describe("MarkFilledButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
  });

  it("renders on an active gig with a hire", () => {
    render(<MarkFilledButton gigId="g1" status="active" hiredCount={1} />);
    expect(screen.getByRole("button", { name: /mark as filled/i })).toBeInTheDocument();
  });

  it("does not render before anyone is hired", () => {
    const { container } = render(<MarkFilledButton gigId="g1" status="active" hiredCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(["filled", "closed", "draft"] as const)("does not render on a %s gig", (status) => {
    const { container } = render(<MarkFilledButton gigId="g1" status={status} hiredCount={2} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sets the gig to filled after confirming, then refreshes", async () => {
    mockUpdateStatus.mockResolvedValue({ data: {} });
    render(<MarkFilledButton gigId="g1" status="active" hiredCount={2} />);
    fireEvent.click(screen.getByRole("button", { name: /mark as filled/i }));
    await waitFor(() => expect(mockUpdateStatus).toHaveBeenCalledWith("g1", "filled"));
    expect(mockConfirm.mock.calls[0][0]).toContain("2 people");
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("does nothing when the poster cancels", async () => {
    mockConfirm.mockResolvedValue(false);
    render(<MarkFilledButton gigId="g1" status="active" hiredCount={1} />);
    fireEvent.click(screen.getByRole("button", { name: /mark as filled/i }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("shows the API error", async () => {
    mockUpdateStatus.mockResolvedValue({ error: "Forbidden" });
    render(<MarkFilledButton gigId="g1" status="active" hiredCount={1} />);
    fireEvent.click(screen.getByRole("button", { name: /mark as filled/i }));
    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
