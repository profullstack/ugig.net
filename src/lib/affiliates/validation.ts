import { AFFILIATE_PRODUCT_TYPES, SKILL_CATEGORIES } from "@/lib/constants";

export interface OfferInput {
  title: string;
  description: string;
  product_url?: string;
  product_type?: string;
  price_sats?: number;
  commission_rate?: number;
  commission_type?: string;
  commission_flat_sats?: number;
  cookie_days?: number;
  settlement_delay_days?: number;
  promo_text?: string;
  category?: string;
  tags?: string[];
  listing_id?: string;
  status?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  sanitized?: OfferInput;
}

export function stripHtmlTags(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateOfferInput(input: OfferInput): ValidationResult {
  const errors: string[] = [];

  // Strip HTML tags from title and description (#26)
  if (input.title) {
    input.title = stripHtmlTags(input.title);
  }
  if (input.description) {
    input.description = stripHtmlTags(input.description);
  }

  if (!input.title || input.title.trim().length < 3) {
    errors.push("Title must be at least 3 characters");
  }
  if (input.title && input.title.length > 200) {
    errors.push("Title must be under 200 characters");
  }

  if (!input.description || input.description.trim().length < 10) {
    errors.push("Description must be at least 10 characters");
  }

  // Normalize product_url — trim whitespace, treat blank as null (#18 - XSS prevention)
  if (input.product_url) {
    input.product_url = input.product_url.trim();
    if (input.product_url.length === 0) {
      input.product_url = undefined;
    } else if (!isValidUrl(input.product_url)) {
      errors.push("product_url must use http:// or https:// scheme");
    }
  }

  // Default price_sats to 0 if not provided (#28)
  if (input.price_sats === undefined || input.price_sats === null) {
    input.price_sats = 0;
  }

  if (typeof input.price_sats !== "number" || input.price_sats < 0) {
    errors.push("price_sats must be a non-negative number");
  }

  const commissionType = input.commission_type || "percentage";

  if (commissionType === "percentage") {
    const commissionRate = input.commission_rate ?? 0.20;
    if (commissionRate < 0.01 || commissionRate > 0.90) {
      errors.push("Commission rate must be between 1% and 90%");
    }
  } else if (commissionType === "flat") {
    const flatSats = input.commission_flat_sats ?? 0;
    if (flatSats < 0) {
      errors.push("commission_flat_sats must be non-negative");
    } else if (flatSats < 1) {
      errors.push("Flat commission must be at least 1 sat");
    }
  }

  // Also reject negative commission_flat_sats even when type is percentage (#23)
  if (input.commission_flat_sats !== undefined && input.commission_flat_sats < 0) {
    if (!errors.some(e => e.includes("commission_flat_sats"))) {
      errors.push("commission_flat_sats must be non-negative");
    }
  }

  const cookieDays = input.cookie_days ?? 30;
  if (cookieDays < 1 || cookieDays > 365) {
    errors.push("Cookie window must be 1-365 days");
  }

  const settlementDays = input.settlement_delay_days ?? 7;
  if (settlementDays < 1 || settlementDays > 90) {
    errors.push("Settlement delay must be 1-90 days");
  }

  if (input.product_type && !AFFILIATE_PRODUCT_TYPES.includes(input.product_type as any)) {
    errors.push(`Product type must be one of: ${AFFILIATE_PRODUCT_TYPES.join(", ")}`);
  }

  if (input.category && !SKILL_CATEGORIES.includes(input.category as any)) {
    errors.push(`Category must be one of: ${SKILL_CATEGORIES.join(", ")}`);
  }

  if (input.tags && input.tags.length > 10) {
    errors.push("Maximum 10 tags");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    sanitized: {
      ...input,
      title: input.title.trim(),
      description: input.description.trim(),
      commission_rate: commissionType === "percentage" ? (input.commission_rate ?? 0.20) : 0,
      commission_type: input.commission_type || "percentage",
      cookie_days: cookieDays,
      settlement_delay_days: settlementDays,
      product_type: input.product_type || "digital",
      tags: input.tags?.map((t) => t.trim().toLowerCase()).filter(Boolean) || [],
    },
  };
}
