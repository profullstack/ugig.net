"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Crown, Zap, ArrowRight } from "lucide-react";

type FundingHistory = {
  payments: Array<{
    id: string;
    tier: string;
    amount_sats: number;
    amount_usd: number;
    status: string;
    paid_at: string | null;
    created_at: string;
  }>;
  credits: number;
  plan: string;
  planStatus: string | null;
};

export function FundingDashboard() {
  const [data, setData] = useState<FundingHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch("/api/funding/history");
        if (res.ok) {
          setData(await res.json());
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data) return null;

  const paidPayments = data.payments.filter((p) => p.status === "paid");

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="border rounded-lg p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CreditCard className="h-4 w-4" />
            Credits Balance
          </div>
          <p className="text-2xl font-bold">
            {data.credits.toLocaleString()}
          </p>
        </div>

        <div className="border rounded-lg p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Crown className="h-4 w-4" />
            Plan
          </div>
          <p className="text-2xl font-bold capitalize">{data.plan}</p>
          {data.plan === "lifetime" && (
            <Badge variant="secondary" className="text-xs">
              Lifetime
            </Badge>
          )}
        </div>

        <div className="border rounded-lg p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="h-4 w-4" />
            Contributions
          </div>
          <p className="text-2xl font-bold">{paidPayments.length}</p>
        </div>
      </div>

      {/* Contribution History */}
      {paidPayments.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">Contribution History</h3>
          <div className="border rounded-lg divide-y">
            {paidPayments.map((payment) => (
              <div
                key={payment.id}
                className="p-3 flex items-center justify-between"
              >
                <div className="space-y-1">
                  <span className="font-medium capitalize">
                    {payment.tier.replace(/_/g, " ")}
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {payment.amount_sats.toLocaleString()} sats ($
                    {payment.amount_usd})
                  </p>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  {payment.paid_at
                    ? new Date(payment.paid_at).toLocaleDateString()
                    : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <Link href="/funding">
        <Button variant="outline" className="w-full">
          <Zap className="h-4 w-4 mr-2" />
          Fund ugig.net
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </Link>
    </div>
  );
}
