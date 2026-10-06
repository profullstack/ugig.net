"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface Transaction {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  amount_usd: number;
  currency: string;
  paid_at: string;
}

function TopContributorsInner() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const pendingPayment = searchParams.get("payment") === "success";

  useEffect(() => {
    const load = () => {
      fetch("/api/funding/contributors")
        .then((r) => r.json())
        .then((d) => setTransactions(d.transactions || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    load();
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      const delay = pendingPayment
        ? 10_000
        : document.hidden
          ? 15 * 60_000
          : 60_000;
      timer = setTimeout(() => {
        load();
        schedule();
      }, delay);
    }
    schedule();
    function onVis() {
      clearTimeout(timer);
      if (!document.hidden) load();
      schedule();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pendingPayment]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-muted rounded-lg" />
        ))}
      </div>
    );
  }

  if (transactions.length === 0 && !pendingPayment) {
    return (
      <p className="text-muted-foreground text-sm">
        No contributions yet. Be the first!
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {pendingPayment && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 animate-pulse">
          <div className="h-8 w-8 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
            <div className="h-4 w-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
              Payment processing...
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Waiting for confirmation
            </p>
          </div>
        </div>
      )}
      {transactions.map((tx) => (
        <div
          key={tx.id}
          className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
        >
          <div className="flex-shrink-0">
            {tx.avatar_url ? (
              <img
                src={tx.avatar_url}
                alt={tx.username}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                {tx.username[0]?.toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <Link
              href={`/u/${tx.username}`}
              className="text-sm font-medium hover:underline truncate block"
            >
              {tx.full_name || tx.username}
            </Link>
            <p className="text-xs text-muted-foreground">
              {new Date(tx.paid_at).toLocaleDateString()} ·{" "}
              {tx.currency === "card"
                ? "CoinPay"
                : `${tx.currency.toUpperCase()} (via CoinPay)`}
            </p>
          </div>

          <div className="text-sm font-semibold">
            ${Number(tx.amount_usd).toFixed(2)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TopContributors() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg" />
          ))}
        </div>
      }
    >
      <TopContributorsInner />
    </Suspense>
  );
}
