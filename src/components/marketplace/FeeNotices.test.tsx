import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BuyerPriceNote, SellerFeeNotice } from "./FeeNotices";
import { MCP_FEE_RATES, SKILL_FEE_RATES } from "@/lib/constants";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/providers/DialogProvider", () => ({
  useDialog: () => ({ confirm: vi.fn(), alert: vi.fn() }),
}));

import { McpListingForm } from "@/components/mcp/McpListingForm";
import { SkillPurchaseButton } from "@/components/skills/SkillPurchaseButton";
import { McpPurchaseButton } from "@/components/mcp/McpPurchaseButton";
import { PromptPurchaseButton } from "@/components/prompts/PromptPurchaseButton";

describe("SellerFeeNotice", () => {
  it("shows both rates and the seller's net", () => {
    render(<SellerFeeNotice priceSats={1000} rates={SKILL_FEE_RATES} />);
    const note = screen.getByTestId("seller-fee-notice");
    expect(note).toHaveTextContent("ugig keeps 5% (2% on Pro or Lifetime)");
    expect(note).toHaveTextContent("You receive 950 sats (980 on Pro or Lifetime) per sale");
  });

  it("says free listings carry no fee", () => {
    render(<SellerFeeNotice priceSats={0} rates={SKILL_FEE_RATES} />);
    expect(screen.getByText("0 for free listing (no fee)")).toBeInTheDocument();
  });

  it("updates on a listing form as the seller types a price", () => {
    render(<McpListingForm />);
    fireEvent.change(screen.getByLabelText("Price (sats)"), { target: { value: "2000" } });
    expect(screen.getByTestId("seller-fee-notice")).toHaveTextContent(
      "You receive 1,900 sats (1,960 on Pro or Lifetime)"
    );
    expect(MCP_FEE_RATES.free).toBe(0.05);
  });
});

describe("BuyerPriceNote", () => {
  it.each([
    ["skill", SkillPurchaseButton],
    ["mcp", McpPurchaseButton],
    ["prompt", PromptPurchaseButton],
  ])("%s buy button states the exact price and no buyer fee", (_name, Button) => {
    render(<Button slug="x" priceSats={1500} />);
    expect(screen.getByTestId("buyer-price-note")).toHaveTextContent(
      "You pay exactly 1,500 sats from your ugig wallet. No buyer fee."
    );
  });

  it("is hidden for free listings", () => {
    render(<BuyerPriceNote priceSats={0} />);
    expect(screen.queryByTestId("buyer-price-note")).not.toBeInTheDocument();
  });
});
