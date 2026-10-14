import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { OrdersList } from "./OrdersList";

export const metadata = {
  title: "Orders | ugig.net",
  description: "Buy now orders you placed or received",
};

export default async function OrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/orders");

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="text-2xl font-bold mb-1">Orders</h1>
        <p className="text-muted-foreground mb-6">
          Buy now orders are paid into CoinPay escrow. Sellers deliver, buyers release.
        </p>
        <OrdersList currentUserId={user.id} />
      </div>
    </main>
  );
}
