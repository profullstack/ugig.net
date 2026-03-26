-- Gig invoices via CoinPayPortal
CREATE TABLE IF NOT EXISTS gig_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id uuid NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications(id),
  worker_id uuid NOT NULL REFERENCES profiles(id),
  poster_id uuid NOT NULL REFERENCES profiles(id),
  coinpay_invoice_id text,
  amount_usd numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'paid', 'cancelled', 'expired')),
  pay_url text,
  notes text,
  due_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_gig_invoices_gig_id ON gig_invoices(gig_id);
CREATE INDEX idx_gig_invoices_worker_id ON gig_invoices(worker_id);
CREATE INDEX idx_gig_invoices_poster_id ON gig_invoices(poster_id);
CREATE INDEX idx_gig_invoices_status ON gig_invoices(status);
CREATE INDEX idx_gig_invoices_coinpay ON gig_invoices(coinpay_invoice_id);

-- RLS
ALTER TABLE gig_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoices they're involved in"
  ON gig_invoices FOR SELECT
  USING (auth.uid() = worker_id OR auth.uid() = poster_id);

CREATE POLICY "Workers can create invoices"
  ON gig_invoices FOR INSERT
  WITH CHECK (auth.uid() = worker_id);

CREATE POLICY "Workers can update their invoices"
  ON gig_invoices FOR UPDATE
  USING (auth.uid() = worker_id);
