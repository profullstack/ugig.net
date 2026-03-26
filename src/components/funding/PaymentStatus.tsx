"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function PaymentStatusInner() {
  const searchParams = useSearchParams();
  const payment = searchParams.get("payment");

  if (payment === "success") {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <p className="text-green-800 dark:text-green-300 font-medium">
          ✅ Payment received! Thank you for your contribution. Your funding will be reflected shortly.
        </p>
      </div>
    );
  }

  if (payment === "cancelled") {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <p className="text-yellow-800 dark:text-yellow-300 font-medium">
          Payment was cancelled. No charges were made.
        </p>
      </div>
    );
  }

  return null;
}

export function PaymentStatus() {
  return (
    <Suspense fallback={null}>
      <PaymentStatusInner />
    </Suspense>
  );
}
