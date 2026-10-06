import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ZapButton } from "./ZapButton";

describe("ZapButton fee disclosure", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/profile")) {
        return new Response(JSON.stringify({ profile: { ln_address: "me@example.test" } }));
      }
      return new Response(JSON.stringify({ total_sats: 0, zap_count: 0 }));
    });
  });

  it("shows the 2% platform fee before any zap is sent", async () => {
    render(<ZapButton targetType="post" targetId="p1" recipientId="r1" />);
    fireEvent.click(screen.getByTitle("Zap"));
    const note = await screen.findByTestId("zap-fee-note");
    expect(note).toHaveTextContent("2% platform fee");
    expect(note).toHaveTextContent("the recipient gets 98%");
    expect(screen.getByRole("button", { name: "1,000" })).toHaveAttribute(
      "title",
      "Recipient receives 980 sats"
    );
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
      expect(calls).not.toContain("/api/wallet/zap");
    });
  });
});
