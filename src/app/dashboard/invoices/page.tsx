import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InvoicePaymentActions } from "./InvoicePaymentActions";
import { InvoiceCharges } from "./InvoiceCharges";
import {
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  Clock,
  Send,
  FileText,
  DollarSign,
} from "lucide-react";

export const metadata = {
  title: "Invoices | ugig.net",
  description: "Send and pay invoices for gigs",
};

type TabKey = "received" | "sent";

interface Counterparty {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

interface InvoiceRow {
  id: string;
  gig_id: string;
  application_id: string;
  worker_id: string;
  poster_id: string;
  amount_usd: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "cancelled" | "expired" | "rejected";
  pay_url: string | null;
  notes: string | null;
  due_date: string | null;
  metadata: {
    payment_address?: string | null;
    amount_crypto?: string | number | null;
    payment_currency?: string | null;
    checkout_url?: string | null;
    expires_at?: string | null;
    replacement_requested_at?: string | null;
    pr_links?: string[] | null;
  } | null;
  created_at: string;
  gig: { id: string; title: string } | null;
  worker: Counterparty | null;
  poster: Counterparty | null;
  items:
    | {
        id: string;
        description: string | null;
        quantity: number | null;
        unit_price_usd: number | null;
        amount_usd: number;
        link: string | null;
        position: number;
      }[]
    | null;
}

function statusBadge(status: InvoiceRow["status"]) {
  switch (status) {
    case "sent":
      return (
        <Badge className="gap-1 bg-blue-500/10 text-blue-600 border-blue-500/20">
          <Send className="h-3 w-3" /> Awaiting payment
        </Badge>
      );
    case "paid":
      return (
        <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
          <CheckCircle2 className="h-3 w-3" /> Paid
        </Badge>
      );
    case "draft":
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" /> Draft
        </Badge>
      );
    case "cancelled":
      return <Badge variant="secondary">Cancelled</Badge>;
    case "rejected":
      return (
        <Badge className="gap-1 bg-red-500/10 text-red-600 border-red-500/20">
          Rejected
        </Badge>
      );
    case "expired":
      return (
        <Badge className="gap-1 bg-blue-500/10 text-blue-600 border-blue-500/20">
          <Send className="h-3 w-3" /> Awaiting payment
        </Badge>
      );
  }
}

function counterpartyName(c: Counterparty | null): string {
  if (!c) return "Unknown";
  return c.full_name || c.username || "Unknown";
}

function isAwaitingPayment(status: InvoiceRow["status"]) {
  return status === "sent" || status === "expired";
}

export default async function InvoicesDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?redirect=/dashboard/invoices");
  }

  const tabParam = (await searchParams).tab;
  const tab: TabKey = tabParam === "sent" ? "sent" : "received";

  const { data: invoiceData } = await (supabase as any)
    .from("gig_invoices")
    .select(
      `
      *,
      gig:gigs (id, title),
      worker:profiles!worker_id (id, username, full_name, avatar_url),
      poster:profiles!poster_id (id, username, full_name, avatar_url),
      items:gig_invoice_items (id, description, quantity, unit_price_usd, amount_usd, link, position)
    `
    )
    .or(`worker_id.eq.${user.id},poster_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const invoices = (invoiceData || []) as InvoiceRow[];
  const sent = invoices.filter((i) => i.worker_id === user.id);
  const received = invoices.filter((i) => i.poster_id === user.id);

  const totalOwed = received
    .filter((i) => isAwaitingPayment(i.status))
    .reduce((s, i) => s + Number(i.amount_usd || 0), 0);
  const totalEarned = sent
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.amount_usd || 0), 0);
  const totalPendingForMe = sent
    .filter((i) => isAwaitingPayment(i.status))
    .reduce((s, i) => s + Number(i.amount_usd || 0), 0);

  const list = tab === "sent" ? sent : received;

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Invoices</h1>
          <p className="text-muted-foreground">
            Pay accepted applicants, and track invoices you&apos;ve sent for gigs you worked on.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-5 bg-card rounded-lg border border-border shadow-sm">
            <p className="text-2xl font-bold text-blue-600">${totalOwed.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground mt-1">You owe (unpaid received)</p>
          </div>
          <div className="p-5 bg-card rounded-lg border border-border shadow-sm">
            <p className="text-2xl font-bold text-yellow-600">${totalPendingForMe.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground mt-1">Awaiting payment to you</p>
          </div>
          <div className="p-5 bg-card rounded-lg border border-border shadow-sm">
            <p className="text-2xl font-bold text-green-600">${totalEarned.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground mt-1">Earned (paid invoices)</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-6">
          <Link
            href="/dashboard/invoices?tab=received"
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "received"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Invoices Received ({received.length})
          </Link>
          <Link
            href="/dashboard/invoices?tab=sent"
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "sent"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Invoices Sent ({sent.length})
          </Link>
        </div>

        {/* Invoice list */}
        <div>
          <h2 className="text-lg font-semibold mb-4">
            {tab === "received" ? "Invoices from workers" : "Invoices you've sent"}
          </h2>

          {list.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-lg border border-border">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground mb-1">
                {tab === "received" ? "No invoices received yet" : "No invoices sent yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {tab === "received"
                  ? "When a worker bills you (or you initiate a payment), it will appear here."
                  : "Once you're accepted on a gig, you can send an invoice from the gig page."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((inv) => {
                const counterparty =
                  tab === "received" ? inv.worker : inv.poster;
                return (
                  <div
                    key={inv.id}
                    className="p-4 bg-card rounded-lg border border-border shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span className="text-lg font-semibold">
                            ${Number(inv.amount_usd).toFixed(2)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {inv.currency}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {tab === "received" ? "From " : "To "}
                          <span className="font-medium text-foreground">
                            {counterpartyName(counterparty)}
                          </span>
                          {inv.gig && (
                            <>
                              {" · "}
                              <Link
                                href={`/gigs/${inv.gig.id}`}
                                className="hover:text-primary inline-flex items-center gap-1"
                              >
                                {inv.gig.title}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {statusBadge(inv.status)}
                        {inv.metadata?.replacement_requested_at &&
                          isAwaitingPayment(inv.status) && (
                            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 border border-amber-500/20">
                              New invoice requested
                            </span>
                          )}
                      </div>
                    </div>

                    {inv.notes && (
                      <p className="text-sm text-muted-foreground mb-3">{inv.notes}</p>
                    )}

                    <div className="mb-3">
                      <InvoiceCharges
                        amountUsd={Number(inv.amount_usd)}
                        currency={inv.currency}
                        gigTitle={inv.gig?.title ?? null}
                        items={inv.items}
                        metadata={inv.metadata}
                      />
                    </div>

                    {inv.metadata?.pr_links && inv.metadata.pr_links.length > 0 && (
                      <div className="mb-3 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          Merged PRs
                        </p>
                        <ul className="space-y-0.5">
                          {inv.metadata.pr_links.map((url) => (
                            <li key={url}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-primary hover:underline break-all"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                {url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>
                        Created {new Date(inv.created_at).toLocaleDateString()}
                        {inv.due_date && (
                          <> · Due {new Date(inv.due_date).toLocaleDateString()}</>
                        )}
                      </span>
                      {tab === "sent" && inv.status === "sent" && inv.pay_url && (
                        <a
                          href={inv.pay_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View payment link
                        </a>
                      )}
                    </div>

                    {tab === "received" && (
                      <div className="mt-3">
                        <InvoicePaymentActions
                          invoiceId={inv.id}
                          gigId={inv.gig_id}
                          applicationId={inv.application_id}
                          amountUsd={Number(inv.amount_usd)}
                          currency={inv.currency}
                          status={inv.status}
                          payUrl={inv.pay_url}
                          notes={inv.notes}
                          dueDate={inv.due_date}
                          metadata={inv.metadata}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-8 text-center">
          <Link href="/gigs">
            <Button variant="outline">Browse gigs</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
