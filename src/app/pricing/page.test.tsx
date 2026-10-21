import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/components/layout/Header", () => ({ Header: () => null }));

import PricingPage, { metadata } from "./page";

describe("/pricing", () => {
  it("lists the plans.ts prices and links every paid plan to checkout", () => {
    const { container } = render(<PricingPage />);
    const text = container.textContent || "";
    expect(text).toContain("$9");
    expect(text).toContain("$90/year");
    expect(text).toContain("$100");
    expect(text).not.toMatch(/stripe/i);
    expect(text).not.toContain("—");
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining(["/checkout?plan=monthly", "/checkout?plan=annual", "/checkout?plan=lifetime"])
    );
  });

  it("is indexable with a canonical URL", () => {
    expect(metadata.robots).toMatchObject({ index: true });
    expect((metadata.alternates as any).canonical).toMatch(/\/pricing$/);
  });
});
