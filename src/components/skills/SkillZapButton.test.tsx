import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SkillZapButton } from "./SkillZapButton";

describe("SkillZapButton fee disclosure", () => {
  it("shows the fee and what the seller receives for the typed amount", () => {
    render(<SkillZapButton listingId="l1" sellerId="s1" initialZapsTotal={0} />);
    fireEvent.click(screen.getByRole("button", { name: /zap/i }));
    fireEvent.change(screen.getByPlaceholderText("sats"), { target: { value: "1000" } });
    const note = screen.getByTestId("zap-fee-note");
    expect(note).toHaveTextContent("You pay 1,000 sats");
    expect(note).toHaveTextContent("2% platform fee (20 sats)");
    expect(note).toHaveTextContent("the seller receives 980 sats");
  });
});
