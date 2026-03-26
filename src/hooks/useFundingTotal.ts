"use client";

import { useState, useEffect } from "react";

interface FundingTotal {
  total_usd: number;
  contributors: number;
}

export function useFundingTotal() {
  const [data, setData] = useState<FundingTotal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/funding/total")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}
