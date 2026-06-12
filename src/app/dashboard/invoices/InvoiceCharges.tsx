interface InvoiceItem {
  id: string;
  description: string | null;
  quantity?: number | null;
  unit_price_usd?: number | null;
  amount_usd: number;
  link?: string | null;
  position: number;
}

interface InvoiceChargesProps {
  amountUsd: number;
  currency: string;
  gigTitle: string | null;
  items?: InvoiceItem[] | null;
  metadata: {
    amount_crypto?: string | number | null;
    payment_currency?: string | null;
    expires_at?: string | null;
  } | null;
}

// Itemized view of what an invoice bills: the line items (or a single
// synthesized line for older invoices without items), the total, and the
// live crypto quote when a payment request exists.
export function InvoiceCharges({
  amountUsd,
  currency,
  gigTitle,
  items,
  metadata,
}: InvoiceChargesProps) {
  const crypto = metadata?.amount_crypto;
  const cryptoCurrency = metadata?.payment_currency;

  function formatItem(it: InvoiceItem): { label: string; amount: number; link: string | null } {
    const qty = Number(it.quantity ?? 1);
    const unitPrice = Number(it.unit_price_usd ?? it.amount_usd);
    const total = Number(it.amount_usd);
    const desc = (it.description || "").trim() || "Charge";
    const qtyStr = qty % 1 === 0 ? String(qty) : qty.toFixed(2);
    const showBreakdown = qty !== 1 || (it.unit_price_usd != null && it.unit_price_usd !== it.amount_usd);
    const label = showBreakdown ? desc + " (" + qtyStr + " x $" + unitPrice.toFixed(2) + ")" : desc;
    return { label, amount: total, link: it.link || null };
  }

  const lines =
    items && items.length > 0
      ? [...items].sort((a, b) => a.position - b.position).map(formatItem)
      : [
          {
            label: gigTitle ? "Work on \"" + gigTitle + "\"" : "Invoice amount",
            amount: amountUsd,
            link: null as string | null,
          },
        ];

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Charges
      </p>
      <div className="divide-y divide-border/60">
        {lines.map((line, i) => (
          <div key={i} className="flex items-start justify-between gap-3 py-1">
            {line.link ? (
              <a
                href={line.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                {line.label}
              </a>
            ) : (
              <span className="text-foreground">{line.label}</span>
            )}
            <span className="whitespace-nowrap font-medium tabular-nums">
              ${line.amount.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2">
        <span className="font-medium">Total</span>
        <span className="font-semibold tabular-nums">
          ${amountUsd.toFixed(2)}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {currency}
          </span>
        </span>
      </div>
      {crypto != null && cryptoCurrency && (
        <p className="mt-2 text-xs text-muted-foreground">
          ≈ {String(crypto)} {String(cryptoCurrency).toUpperCase()} at the
          current market rate
          {metadata?.expires_at
            ? ` · quote expires ${new Date(metadata.expires_at).toLocaleString()}`
            : ""}
        </p>
      )}
    </div>
  );
}
