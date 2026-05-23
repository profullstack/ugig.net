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

export interface UpdateValidationResult {
  ok: boolean;
  errors: string[];
  sanitized?: Partial<OfferInput>;
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
  if (input.title !== undefined && input.title !== null && typeof input.title !== "string") {
    errors.push("Title must be text");
  } else if (input.title) {
    input.title = stripHtmlTags(input.title);
  }
  if (
    input.description !== undefined &&
    input.description !== null &&
    typeof input.description !== "string"
  ) {
    errors.push("Description must be text");
  } else if (input.description) {
    input.description = stripHtmlTags(input.description);
  }

  if (
    typeof input.title !== "string" ||
    !input.title ||
    input.title.trim().length < 3
  ) {
    errors.push("Title must be at least 3 characters");
  }
  if (typeof input.title === "string" && input.title.length > 200) {
    errors.push("Title must be under 200 characters");
  }

  if (
    typeof input.description !== "string" ||
    !input.description ||
    input.description.trim().length < 10
  ) {
    errors.push("Description must be at least 10 characters");
  }

  // Normalize product_url — trim whitespace, treat blank as null (#18 - XSS prevention)
  if (input.product_url !== undefined && input.product_url !== null && typeof input.product_url !== "string") {
    errors.push("product_url must be a string");
  } else if (input.product_url) {
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

  if (
    typeof input.price_sats !== "number" ||
    !Number.isFinite(input.price_sats) ||
    input.price_sats < 0
  ) {
    errors.push("price_sats must be a non-negative number");
  }

  const commissionType = input.commission_type || "percentage";

  if (
    typeof commissionType !== "string" ||
    !["percentage", "flat"].includes(commissionType)
  ) {
    errors.push("commission_type must be percentage or flat");
  }

  if (
    input.commission_rate !== undefined &&
    (typeof input.commission_rate !== "number" ||
      !Number.isFinite(input.commission_rate))
  ) {
    errors.push("commission_rate must be a number");
  }

  if (
    input.commission_flat_sats !== undefined &&
    (typeof input.commission_flat_sats !== "number" ||
      !Number.isFinite(input.commission_flat_sats))
  ) {
    errors.push("commission_flat_sats must be a number");
  }

  if (commissionType === "percentage") {
    const commissionRate = input.commission_rate ?? 0.20;
    if (
      typeof commissionRate === "number" &&
      (commissionRate < 0.01 || commissionRate > 0.90)
    ) {
      errors.push("Commission rate must be between 1% and 90%");
    }
  } else if (commissionType === "flat") {
    const flatSats = input.commission_flat_sats ?? 0;
    if (typeof flatSats !== "number") {
      // The type-specific error was already added above.
    } else if (flatSats < 0) {
      errors.push("commission_flat_sats must be non-negative");
    } else if (flatSats < 1) {
      errors.push("Flat commission must be at least 1 sat");
    }
  }

  // Also reject negative commission_flat_sats even when type is percentage (#23)
  if (
    typeof input.commission_flat_sats === "number" &&
    input.commission_flat_sats < 0
  ) {
    if (!errors.some(e => e.includes("commission_flat_sats"))) {
      errors.push("commission_flat_sats must be non-negative");
    }
  }

  const cookieDays = input.cookie_days ?? 30;
  if (
    typeof cookieDays !== "number" ||
    !Number.isFinite(cookieDays) ||
    cookieDays < 1 ||
    cookieDays > 365
  ) {
    errors.push("Cookie window must be 1-365 days");
  }

  const settlementDays = input.settlement_delay_days ?? 7;
  if (
    typeof settlementDays !== "number" ||
    !Number.isFinite(settlementDays) ||
    settlementDays < 1 ||
    settlementDays > 90
  ) {
    errors.push("Settlement delay must be 1-90 days");
  }

  if (input.product_type && !AFFILIATE_PRODUCT_TYPES.includes(input.product_type as any)) {
    errors.push(`Product type must be one of: ${AFFILIATE_PRODUCT_TYPES.join(", ")}`);
  }

  if (input.category && !SKILL_CATEGORIES.includes(input.category as any)) {
    errors.push(`Category must be one of: ${SKILL_CATEGORIES.join(", ")}`);
  }

  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags)) {
      errors.push("tags must be an array");
    } else if (input.tags.some((tag) => typeof tag !== "string")) {
      errors.push("tags must contain only strings");
    } else if (input.tags.length > 10) {
      errors.push("Maximum 10 tags");
    }
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

export function validateOfferUpdateInput(
  input: Partial<OfferInput>
): UpdateValidationResult {
  const errors: string[] = [];
  const sanitized: Partial<OfferInput> = {};

  if (input.title !== undefined) {
    if (typeof input.title !== "string") {
      errors.push("Title must be text");
    } else {
      const title = stripHtmlTags(input.title).trim();
      if (title.length < 3) {
        errors.push("Title must be at least 3 characters");
      } else if (title.length > 200) {
        errors.push("Title must be under 200 characters");
      } else {
        sanitized.title = title;
      }
    }
  }

  if (input.description !== undefined) {
    if (typeof input.description !== "string") {
      errors.push("Description must be text");
    } else {
      const description = stripHtmlTags(input.description).trim();
      if (description.length < 10) {
        errors.push("Description must be at least 10 characters");
      } else {
        sanitized.description = description;
      }
    }
  }

  if (input.product_url !== undefined) {
    if (input.product_url !== null && typeof input.product_url !== "string") {
      errors.push("product_url must be a string");
    } else if (input.product_url === null) {
      sanitized.product_url = undefined;
    } else {
      const productUrl = input.product_url.trim();
      if (productUrl.length === 0) {
        sanitized.product_url = undefined;
      } else if (!isValidUrl(productUrl)) {
        errors.push("product_url must use http:// or https:// scheme");
      } else {
        sanitized.product_url = productUrl;
      }
    }
  }

  if (input.product_type !== undefined) {
    if (typeof input.product_type !== "string") {
      errors.push("Product type must be text");
    } else if (!AFFILIATE_PRODUCT_TYPES.includes(input.product_type as any)) {
      errors.push(`Product type must be one of: ${AFFILIATE_PRODUCT_TYPES.join(", ")}`);
    } else {
      sanitized.product_type = input.product_type;
    }
  }

  if (input.price_sats !== undefined) {
    if (
      typeof input.price_sats !== "number" ||
      !Number.isFinite(input.price_sats) ||
      input.price_sats < 0
    ) {
      errors.push("price_sats must be a non-negative number");
    } else {
      sanitized.price_sats = input.price_sats;
    }
  }

  if (input.commission_type !== undefined) {
    if (
      typeof input.commission_type !== "string" ||
      !["percentage", "flat"].includes(input.commission_type)
    ) {
      errors.push("commission_type must be percentage or flat");
    } else {
      sanitized.commission_type = input.commission_type;
    }
  }

  if (input.commission_rate !== undefined) {
    if (
      typeof input.commission_rate !== "number" ||
      !Number.isFinite(input.commission_rate)
    ) {
      errors.push("commission_rate must be a number");
    } else if (
      input.commission_type !== "flat" &&
      (input.commission_rate < 0.01 || input.commission_rate > 0.90)
    ) {
      errors.push("Commission rate must be between 1% and 90%");
    } else if (input.commission_type === "flat" && input.commission_rate !== 0) {
      errors.push("commission_rate must be 0 for flat commissions");
    } else {
      sanitized.commission_rate = input.commission_rate;
    }
  }

  if (input.commission_flat_sats !== undefined) {
    if (
      typeof input.commission_flat_sats !== "number" ||
      !Number.isFinite(input.commission_flat_sats)
    ) {
      errors.push("commission_flat_sats must be a number");
    } else if (input.commission_flat_sats < 0) {
      errors.push("commission_flat_sats must be non-negative");
    } else if (input.commission_flat_sats < 1) {
      errors.push("Flat commission must be at least 1 sat");
    } else {
      sanitized.commission_flat_sats = input.commission_flat_sats;
    }
  }

  if (input.cookie_days !== undefined) {
    if (
      typeof input.cookie_days !== "number" ||
      !Number.isFinite(input.cookie_days) ||
      input.cookie_days < 1 ||
      input.cookie_days > 365
    ) {
      errors.push("Cookie window must be 1-365 days");
    } else {
      sanitized.cookie_days = input.cookie_days;
    }
  }

  if (input.settlement_delay_days !== undefined) {
    if (
      typeof input.settlement_delay_days !== "number" ||
      !Number.isFinite(input.settlement_delay_days) ||
      input.settlement_delay_days < 1 ||
      input.settlement_delay_days > 90
    ) {
      errors.push("Settlement delay must be 1-90 days");
    } else {
      sanitized.settlement_delay_days = input.settlement_delay_days;
    }
  }

  if (input.promo_text !== undefined) {
    if (typeof input.promo_text !== "string") {
      errors.push("promo_text must be text");
    } else {
      sanitized.promo_text = stripHtmlTags(input.promo_text).trim();
    }
  }

  if (input.category !== undefined) {
    if (typeof input.category !== "string") {
      errors.push("Category must be text");
    } else if (!SKILL_CATEGORIES.includes(input.category as any)) {
      errors.push(`Category must be one of: ${SKILL_CATEGORIES.join(", ")}`);
    } else {
      sanitized.category = input.category;
    }
  }

  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags)) {
      errors.push("tags must be an array");
    } else if (input.tags.some((tag) => typeof tag !== "string")) {
      errors.push("tags must contain only strings");
    } else if (input.tags.length > 10) {
      errors.push("Maximum 10 tags");
    } else {
      sanitized.tags = input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
    }
  }

  if (input.listing_id !== undefined) {
    if (input.listing_id !== null && typeof input.listing_id !== "string") {
      errors.push("listing_id must be text");
    } else {
      sanitized.listing_id = input.listing_id || undefined;
    }
  }

  if (input.status !== undefined) {
    if (typeof input.status !== "string") {
      errors.push("status must be text");
    } else {
      sanitized.status = input.status;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, errors: [], sanitized };
}
