import { describe, it, expect } from "vitest";
import { validateOfferInput, validateOfferUpdateInput, stripHtmlTags, isValidUrl } from "./validation";

describe("stripHtmlTags", () => {
  it("removes HTML tags from strings", () => {
    expect(stripHtmlTags('<script>alert("xss")</script>Hello')).toBe('alert("xss")Hello');
    expect(stripHtmlTags("<b>Bold</b> text")).toBe("Bold text");
    expect(stripHtmlTags("No tags here")).toBe("No tags here");
    expect(stripHtmlTags('<img src="x" onerror="alert(1)">')).toBe("");
  });
});

describe("isValidUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("http://example.com/path")).toBe(true);
  });

  it("rejects javascript: URLs (#18 XSS)", () => {
    expect(isValidUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects data: URLs", () => {
    expect(isValidUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects vbscript: URLs", () => {
    expect(isValidUrl("vbscript:MsgBox")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isValidUrl("not-a-url")).toBe(false);
    expect(isValidUrl("")).toBe(false);
  });
});

describe("validateOfferInput", () => {
  const validInput = {
    title: "Test Offer Title",
    description: "This is a valid description for the offer",
    product_url: "https://example.com",
    price_sats: 1000,
    commission_type: "percentage",
    commission_rate: 0.2,
  };

  it("accepts valid input", () => {
    const result = validateOfferInput({ ...validInput });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects javascript: URL in product_url (#18)", () => {
    const result = validateOfferInput({
      ...validInput,
      product_url: "javascript:alert(document.cookie)",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("product_url"))).toBe(true);
  });

  it("rejects non-string text and URL fields without throwing", () => {
    const result = validateOfferInput({
      ...validInput,
      title: { text: "Bad title" },
      description: ["Bad description"],
      product_url: { href: "https://example.com" },
    } as any);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Title must be text",
        "Description must be text",
        "product_url must be a string",
      ])
    );
  });

  it("keeps required-field validation for missing title and description", () => {
    const result = validateOfferInput({
      price_sats: 1000,
      commission_type: "percentage",
      commission_rate: 0.2,
    } as any);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Title must be at least 3 characters",
        "Description must be at least 10 characters",
      ])
    );
  });

  it("rejects malformed numeric and enum fields without coercing them", () => {
    const result = validateOfferInput({
      ...validInput,
      price_sats: "1000",
      commission_type: "bonus",
      commission_rate: "0.2",
      commission_flat_sats: "500",
      cookie_days: "30",
      settlement_delay_days: Number.NaN,
    } as any);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "price_sats must be a non-negative number",
        "commission_type must be percentage or flat",
        "commission_rate must be a number",
        "commission_flat_sats must be a number",
        "Cookie window must be 1-365 days",
        "Settlement delay must be 1-90 days",
      ])
    );
  });

  it("strips HTML tags from title (#26)", () => {
    const result = validateOfferInput({
      ...validInput,
      title: '<script>alert("xss")</script>Legit Title',
    });
    expect(result.ok).toBe(true);
    expect(result.sanitized!.title).toBe('alert("xss")Legit Title');
    expect(result.sanitized!.title).not.toContain("<script>");
  });

  it("strips HTML tags from description (#26)", () => {
    const result = validateOfferInput({
      ...validInput,
      description: '<img src=x onerror=alert(1)>A valid description here',
    });
    expect(result.ok).toBe(true);
    expect(result.sanitized!.description).not.toContain("<img");
  });

  it("rejects negative commission_flat_sats (#23)", () => {
    const result = validateOfferInput({
      ...validInput,
      commission_type: "flat",
      commission_flat_sats: -100,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("commission_flat_sats") || e.includes("non-negative"))).toBe(true);
  });

  it("defaults price_sats to 0 when not provided (#28)", () => {
    const input = { ...validInput };
    delete (input as any).price_sats;
    const result = validateOfferInput(input as any);
    expect(result.ok).toBe(true);
    expect(result.sanitized!.price_sats).toBe(0);
  });

  it("rejects negative price_sats with field name in error (#28)", () => {
    const result = validateOfferInput({
      ...validInput,
      price_sats: -10,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("price_sats"))).toBe(true);
  });

  it("trims whitespace-only product_url to undefined", () => {
    const result = validateOfferInput({
      ...validInput,
      product_url: "   ",
    });
    expect(result.ok).toBe(true);
    expect(result.sanitized!.product_url).toBeFalsy();
  });

  // Regression tests for defaults
  it("defaults commission_rate to 0.20 for percentage type", () => {
    const result = validateOfferInput({
      ...validInput,
      commission_type: "percentage",
      commission_rate: undefined,
    });
    expect(result.ok).toBe(true);
    expect(result.sanitized!.commission_rate).toBe(0.2);
  });

  it("defaults cookie_days to 30", () => {
    const result = validateOfferInput({
      ...validInput,
      cookie_days: undefined,
    });
    expect(result.ok).toBe(true);
    expect(result.sanitized!.cookie_days).toBe(30);
  });

  it("defaults settlement_delay_days to 7", () => {
    const result = validateOfferInput({
      ...validInput,
      settlement_delay_days: undefined,
    });
    expect(result.ok).toBe(true);
    expect(result.sanitized!.settlement_delay_days).toBe(7);
  });

  it("defaults product_type to digital", () => {
    const result = validateOfferInput({
      ...validInput,
      product_type: undefined,
    });
    expect(result.ok).toBe(true);
    expect(result.sanitized!.product_type).toBe("digital");
  });

  it("normalizes tags to lowercase and trims", () => {
    const result = validateOfferInput({
      ...validInput,
      tags: [" Finance ", "CRYPTO", " "],
    });
    expect(result.ok).toBe(true);
    expect(result.sanitized!.tags).toEqual(["finance", "crypto"]);
  });

  it("rejects more than 10 tags", () => {
    const result = validateOfferInput({
      ...validInput,
      tags: Array(11).fill("tag"),
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("10 tags"))).toBe(true);
  });

  it("rejects malformed tag payloads without throwing", () => {
    expect(
      validateOfferInput({
        ...validInput,
        tags: "finance",
      } as any).errors
    ).toContain("tags must be an array");

    expect(
      validateOfferInput({
        ...validInput,
        tags: ["finance", { label: "crypto" }],
      } as any).errors
    ).toContain("tags must contain only strings");
  });

  it("rejects title shorter than 3 characters", () => {
    const result = validateOfferInput({ ...validInput, title: "AB" });
    expect(result.ok).toBe(false);
  });

  it("rejects description shorter than 10 characters", () => {
    const result = validateOfferInput({ ...validInput, description: "Short" });
    expect(result.ok).toBe(false);
  });
});

describe("validateOfferUpdateInput", () => {
  it("allows switching an offer to flat commission with a zero percentage rate", () => {
    const result = validateOfferUpdateInput({
      commission_type: "flat",
      commission_rate: 0,
      commission_flat_sats: 500,
    });

    expect(result.ok).toBe(true);
    expect(result.sanitized).toMatchObject({
      commission_type: "flat",
      commission_rate: 0,
      commission_flat_sats: 500,
    });
  });

  it("continues to reject zero percentage commission rates", () => {
    const result = validateOfferUpdateInput({
      commission_type: "percentage",
      commission_rate: 0,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Commission rate must be between 1% and 90%");
  });

  it("keeps product_url null in sanitized updates so the column can be cleared", () => {
    const result = validateOfferUpdateInput({
      product_url: null,
    } as any);

    expect(result.ok).toBe(true);
    expect(result.sanitized).toEqual({ product_url: null });
  });

  it("converts blank product_url updates to null", () => {
    const result = validateOfferUpdateInput({
      product_url: "   ",
    });

    expect(result.ok).toBe(true);
    expect(result.sanitized).toEqual({ product_url: null });
  });
});
