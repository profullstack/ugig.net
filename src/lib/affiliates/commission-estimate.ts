export interface CommissionEstimateInput {
  commission_type?: string | null;
  commission_rate?: number | null;
  commission_flat_sats?: number | null;
  price_sats?: number | null;
}

export interface CommissionEstimate {
  estimated_commission_sats: number | null;
  commission_basis: "flat" | "listed_price" | "sale_amount";
}

export function getCommissionEstimate(offer: CommissionEstimateInput): CommissionEstimate {
  if (offer.commission_type === "flat") {
    return {
      estimated_commission_sats: Math.max(0, Math.floor(offer.commission_flat_sats ?? 0)),
      commission_basis: "flat",
    };
  }

  const priceSats = offer.price_sats ?? 0;
  const rate = offer.commission_rate ?? 0;

  if (priceSats > 0 && rate > 0) {
    return {
      estimated_commission_sats: Math.floor(priceSats * rate),
      commission_basis: "listed_price",
    };
  }

  return {
    estimated_commission_sats: null,
    commission_basis: "sale_amount",
  };
}

export function withCommissionEstimate<T extends CommissionEstimateInput>(
  offer: T
): T & CommissionEstimate {
  return {
    ...offer,
    ...getCommissionEstimate(offer),
  };
}
