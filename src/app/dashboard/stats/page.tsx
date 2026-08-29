import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ChartCard } from "@/components/stats/ChartCard";
import { ColumnChart } from "@/components/stats/ColumnChart";
import { StatTile } from "@/components/stats/StatTile";
import { StatsFilters } from "@/components/stats/StatsFilters";
import { TrendChart } from "@/components/stats/TrendChart";
import { formatUnits, formatUsd } from "@/lib/stats/chart-scale";
import {
  breakdownByLabel,
  buildSeries,
  filterRange,
  isPerspective,
  isRangeKey,
  pctChange,
  resolveRange,
  summarize,
  type Perspective,
  type RangeKey,
} from "@/lib/stats/productivity";
import {
  toWorkEvents,
  type StatsBountySubmission,
  type StatsInvoice,
} from "@/lib/stats/work-events";

export const metadata = {
  title: "Productivity vs. cost | ugig.net",
  description:
    "What your work costs and what it delivers, over any time frame.",
};

interface StatsPageProps {
  searchParams: Promise<{ range?: string; view?: string }>;
}

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

const COST_COLOR = "--color-chart-cost";
const WORK_COLOR = "--color-chart-work";

export default async function StatsPage({ searchParams }: StatsPageProps) {
  const params = await searchParams;
  const range: RangeKey = isRangeKey(params.range) ? params.range : "90d";
  const perspective: Perspective = isPerspective(params.view)
    ? params.view
    : "spent";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/dashboard/stats`);
  }

  const spending = perspective === "spent";

  // The generated Database types predate gig_invoices and bounty_submissions,
  // so the client is cast at the call site as elsewhere in the dashboard, and
  // the results are re-typed here rather than leaking `any` into the page.
  const db = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string
        ) => PromiseLike<QueryResult<unknown>> & {
          eq: (column: string, value: string) => PromiseLike<QueryResult<unknown>>;
        };
      };
    };
  };

  const [invoiceResult, bountyResult] = (await Promise.all([
    db
      .from("gig_invoices")
      .select(
        `
        status,
        amount_usd,
        created_at,
        updated_at,
        metadata,
        gig:gigs (title),
        items:gig_invoice_items (description, quantity, amount_usd)
      `
      )
      .eq(spending ? "poster_id" : "worker_id", user.id)
      .eq("status", "paid"),
    // Spending: bounties you funded. Earning: bounties you were paid for.
    // RLS already limits both sides to rows this user may read.
    spending
      ? db
          .from("bounty_submissions")
          .select(
            `payout_status, paid_at, updated_at, created_at, bounty:bounties!inner (title, payout_usd, creator_id)`
          )
          .eq("payout_status", "paid")
          .eq("bounty.creator_id", user.id)
      : db
          .from("bounty_submissions")
          .select(
            `payout_status, paid_at, updated_at, created_at, bounty:bounties (title, payout_usd)`
          )
          .eq("payout_status", "paid")
          .eq("submitter_id", user.id),
  ])) as [QueryResult<StatsInvoice>, QueryResult<StatsBountySubmission>];

  const loadError = invoiceResult.error ?? bountyResult.error;

  const events = toWorkEvents(
    invoiceResult.data ?? [],
    bountyResult.data ?? []
  );

  const now = new Date();
  const { start, end, previousStart, bucket, label } = resolveRange(range, now);

  const current = filterRange(events, start, end);
  const previous =
    previousStart && start ? filterRange(events, previousStart, start) : [];

  const totals = summarize(current);
  const previousTotals = summarize(previous);
  const hasComparison = previous.length > 0;

  const series = buildSeries(events, start, end, bucket);
  const breakdown = breakdownByLabel(current);

  const comparisonLabel =
    range === "all" ? "earlier period" : `previous ${label.toLowerCase()}`;
  const bucketNoun =
    bucket === "day" ? "day" : bucket === "week" ? "week" : "month";

  const costWord = spending ? "spent" : "earned";
  const costTileLabel = spending ? "Total spent" : "Total earned";

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Productivity vs. cost</h1>
        <p className="text-muted-foreground">
          What your work {costWord === "spent" ? "costs" : "pays"} against what
          it delivers. Built from paid invoices and paid bounties, so every
          figure is money that actually moved.
        </p>
      </div>

      <StatsFilters range={range} perspective={perspective} />

      {loadError && (
        <div className="mb-6 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-sm">
          Could not load some figures: {loadError.message}
        </div>
      )}

      {current.length === 0 ? (
        <div className="p-10 bg-card rounded-lg border border-border text-center">
          <p className="font-medium mb-1">
            No paid work in {label.toLowerCase()}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            {spending
              ? "Invoices you have paid and bounties you have funded show up here."
              : "Invoices paid to you and bounties you have been paid for show up here."}
          </p>
          <Link
            href="/dashboard/invoices"
            className="text-sm text-primary hover:underline"
          >
            Go to invoices
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatTile
              label={costTileLabel}
              value={formatUsd(totals.costUsd)}
              change={
                hasComparison
                  ? pctChange(totals.costUsd, previousTotals.costUsd)
                  : null
              }
              changeLabel={comparisonLabel}
              goodDirection={spending ? "neutral" : "up"}
            />
            <StatTile
              label="Work delivered"
              value={formatUnits(totals.units)}
              change={
                hasComparison
                  ? pctChange(totals.units, previousTotals.units)
                  : null
              }
              changeLabel={comparisonLabel}
              goodDirection="up"
              hint="Billed quantity: PRs, tickets, hours — whatever the line items counted."
            />
            <StatTile
              label="Cost per unit of work"
              value={
                totals.costPerUnit === null ? "—" : formatUsd(totals.costPerUnit)
              }
              change={
                hasComparison
                  ? pctChange(totals.costPerUnit, previousTotals.costPerUnit)
                  : null
              }
              changeLabel={comparisonLabel}
              goodDirection={spending ? "down" : "up"}
            />
            <StatTile
              label="Paid line items"
              value={formatUnits(totals.items)}
              change={
                hasComparison
                  ? pctChange(totals.items, previousTotals.items)
                  : null
              }
              changeLabel={comparisonLabel}
              goodDirection="neutral"
            />
          </div>

          <div className="space-y-6">
            <ChartCard
              title={`Cost per ${bucketNoun}`}
              subtitle={`Dollars ${costWord} — ${label.toLowerCase()}`}
              colorVar={COST_COLOR}
              seriesName={`cost per ${bucketNoun}`}
              table={{
                headers: ["Period", "Cost"],
                rows: series.map((p) => [p.rangeLabel, formatUsd(p.costUsd)]),
              }}
            >
              <ColumnChart
                points={series.map((p) => ({
                  key: p.key,
                  label: p.label,
                  rangeLabel: p.rangeLabel,
                  value: p.costUsd,
                }))}
                colorVar={COST_COLOR}
                format="usd"
                valueName={costWord}
                title={`Cost per ${bucketNoun}`}
              />
            </ChartCard>

            <ChartCard
              title={`Work delivered per ${bucketNoun}`}
              subtitle={`Units billed on paid work — ${label.toLowerCase()}`}
              colorVar={WORK_COLOR}
              seriesName={`units per ${bucketNoun}`}
              table={{
                headers: ["Period", "Units"],
                rows: series.map((p) => [p.rangeLabel, formatUnits(p.units)]),
              }}
            >
              <ColumnChart
                points={series.map((p) => ({
                  key: p.key,
                  label: p.label,
                  rangeLabel: p.rangeLabel,
                  value: p.units,
                }))}
                colorVar={WORK_COLOR}
                format="units"
                valueName="units delivered"
                title={`Work delivered per ${bucketNoun}`}
              />
            </ChartCard>

            <ChartCard
              title="Cost per unit of work"
              subtitle={
                spending
                  ? "The efficiency line: falling means you are getting more work per dollar."
                  : "Your effective rate per unit of work delivered."
              }
              colorVar={COST_COLOR}
              seriesName="cost per unit"
              table={{
                headers: ["Period", "Cost per unit"],
                rows: series.map((p) => [
                  p.rangeLabel,
                  p.costPerUnit === null ? "—" : formatUsd(p.costPerUnit),
                ]),
              }}
            >
              <TrendChart
                points={series.map((p) => ({
                  key: p.key,
                  label: p.label,
                  rangeLabel: p.rangeLabel,
                  value: p.costPerUnit,
                }))}
                colorVar={COST_COLOR}
                format="usd"
                valueName="per unit"
                title="Cost per unit of work"
                reference={
                  totals.costPerUnit === null
                    ? null
                    : {
                        value: totals.costPerUnit,
                        label: `period avg ${formatUsd(totals.costPerUnit)}`,
                      }
                }
              />
            </ChartCard>

            <section className="p-5 bg-card rounded-lg border border-border shadow-sm">
              <div className="mb-3">
                <h2 className="text-base font-semibold">Where it went</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Paid line items grouped by what they billed for, dearest first.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-4 font-medium">Work</th>
                      <th className="py-2 pr-4 font-medium text-right">Cost</th>
                      <th className="py-2 pr-4 font-medium text-right">Units</th>
                      <th className="py-2 font-medium text-right">Per unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((row) => (
                      <tr
                        key={row.label}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="py-2 pr-4">{row.label}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatUsd(row.costUsd)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatUnits(row.units)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {row.costPerUnit === null
                            ? "—"
                            : formatUsd(row.costPerUnit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
