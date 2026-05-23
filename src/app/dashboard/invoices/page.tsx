import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  Clock,
  Send,
  FileText,
  DollarSign,
} from "lucide-react";
import { PayApplicantButton } from "./PayApplicantButton";

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
  status: "draft" | "sent" | "paid" | "cancelled" | "expired";
  pay_url: string | null;
  notes: string | null;
  due_date: string | null;
  metadata: {
    payment_address?: string | null;
    amount_crypto?: number | string | null;
    payment_currency?: string | null;
    expires_at?: string | null;
  } | null;
  created_at: string;
  gig: { id: string; title: string } | null;
  worker: Counterparty | null;
  poster: Counterparty | null;
}

interface AcceptedAppRow {
  id: string;
  gig_id: string;
  applicant_id: string;
  proposed_rate: number | null;
  created_at: string;
  gig: {
    id: string;
    title: string;
    budget_min: number | null;
    budget_max: number | null;
  } | null;
  applicant: Counterparty | null;
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
    case "expired":
      return <Badge variant="secondary">Expired</Badge>;
  }
}

function counterpartyName(c: Counterparty | null): string {
  if (!c) return "Unknown";
  return c.full_name || c.username || "Unknown";
}

function paymentAmount(inv: InvoiceRow): string {
  if (inv.metadata?.amount_crypto) {
    return `${inv.metadata.amount_crypto} ${
      inv.metadata.payment_currency || ""
    }`.trim();
  }
  return inv.metadata?.payment_currency || "the selected coin";
}

function paymentDetails(inv: InvoiceRow, label: string) {
  if (!inv.metadata?.payment_address) return null;
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 mb-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <code className="block break-all rounded bg-background px-2 py-1.5 text-xs">
        {inv.metadata.payment_address}
      </code>
      <p className="text-xs text-muted-foreground">
        Send {paymentAmount(inv)} to this address.
        {inv.metadata.expires_at
          ? ` Expires ${new Date(inv.metadata.expires_at).toLocaleString()}.`
          : ""}
      </p>
    </div>
  );
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
      poster:profiles!poster_id (id, username, full_name, avatar_url)
    `
    )
    .or(`worker_id.eq.${user.id},poster_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const invoices = (invoiceData || []) as InvoiceRow[];
  const sent = invoices.filter((i) => i.worker_id === user.id);
  const received = invoices.filter((i) => i.poster_id === user.id);

  // Find accepted applications on the user's own gigs that don't yet have an invoice
  // so the poster can initiate payment directly.
  const { data: posterGigs } = await supabase
    .from("gigs")
    .select("id")
    .eq("poster_id", user.id);
  const gigIds = (posterGigs || []).map((g) => g.id);

  let acceptedNeedingInvoice: AcceptedAppRow[] = [];
  if (gigIds.length > 0) {
    const { data: acceptedApps } = await supabase
      .from("applications")
      .select(
        `
        id, gig_id, applicant_id, proposed_rate, created_at,
        gig:gigs (id, title, budget_min, budget_max),
        applicant:profiles!applicant_id (id, username, full_name, avatar_url)
      `
      )
      .in("gig_id", gigIds)
      .eq("status", "accepted")
      .order("created_at", { ascending: false });

    const invoicedAppIds = new Set(received.map((i) => i.application_id));
    acceptedNeedingInvoice = ((acceptedApps || []) as unknown as AcceptedAppRow[]).filter(
      (a) => !invoicedAppIds.has(a.id)
    );
  }

  const totalOwed = received
    .filter((i) => i.status === "sent")
    .reduce((s, i) => s + Number(i.amount_usd || 0), 0);
  const totalEarned = sent
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.amount_usd || 0), 0);
  const totalPendingForMe = sent
    .filter((i) => i.status === "sent")
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

        {/* Accepted applicants without an invoice — only shown on Received tab */}
        {tab === "received" && acceptedNeedingInvoice.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-2">
              Accepted applicants awaiting payment
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              These workers were accepted but no invoice exists yet. Prepare in-app
              payment details now and they&apos;ll be notified.
            </p>
            <div className="space-y-3">
              {acceptedNeedingInvoice.map((app) => {
                const suggested =
                  app.proposed_rate ||
                  app.gig?.budget_min ||
                  app.gig?.budget_max ||
                  null;
                return (
                  <div
                    key={app.id}
                    className="p-4 bg-card rounded-lg border border-border shadow-sm space-y-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{counterpartyName(app.applicant)}</p>
                        <Link
                          href={`/gigs/${app.gig_id}`}
                          className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                        >
                          {app.gig?.title || "Gig"}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                      {suggested && (
                        <div className="text-sm text-muted-foreground">
                          Suggested: ${suggested}
                        </div>
                      )}
                    </div>
                    <PayApplicantButton
                      gigId={app.gig_id}
                      applicationId={app.id}
                      suggestedAmount={suggested}
                      workerName={counterpartyName(app.applicant)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
                      {statusBadge(inv.status)}
                    </div>

                    {inv.notes && (
                      <p className="text-sm text-muted-foreground mb-3">{inv.notes}</p>
                    )}

                    {tab === "received" &&
                      inv.status === "sent" &&
                      paymentDetails(inv, "In-app payment details")}

                    {tab === "sent" &&
                      inv.status === "sent" &&
                      paymentDetails(inv, "Payment details shared with client")}

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Created {new Date(inv.created_at).toLocaleDateString()}
                        {inv.due_date && (
                          <> · Due {new Date(inv.due_date).toLocaleDateString()}</>
                        )}
                      </span>
                      {tab === "received" &&
                        inv.status === "sent" &&
                        !inv.metadata?.payment_address &&
                        inv.pay_url && (
                          <a
                            href={inv.pay_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Pay now
                          </a>
                        )}
                      {tab === "sent" &&
                        inv.status === "sent" &&
                        !inv.metadata?.payment_address &&
                        inv.pay_url && (
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
