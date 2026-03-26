-- Gig escrow payments via CoinPayPortal
CREATE TABLE IF NOT EXISTS gig_escrows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id uuid NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  poster_id uuid NOT NULL REFERENCES profiles(id),
  worker_id uuid NOT NULL REFERENCES profiles(id),
  application_id uuid NOT NULL REFERENCES applications(id),
  coinpay_escrow_id text,
  coinpay_payment_id text,
  amount_usd numeric NOT NULL,
  currency text NOT NULL DEFAULT 'sol',
  platform_fee_usd numeric NOT NULL DEFAULT 0,
  platform_fee_rate numeric NOT NULL DEFAULT 0.05,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'funded', 'released', 'refunded', 'disputed')),
  funded_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE(gig_id, application_id)
);

-- Index for lookups
CREATE INDEX idx_gig_escrows_gig_id ON gig_escrows(gig_id);
CREATE INDEX idx_gig_escrows_poster_id ON gig_escrows(poster_id);
CREATE INDEX idx_gig_escrows_worker_id ON gig_escrows(worker_id);
CREATE INDEX idx_gig_escrows_status ON gig_escrows(status);
CREATE INDEX idx_gig_escrows_coinpay ON gig_escrows(coinpay_escrow_id);

-- Add in_progress and completed to application status if not there
-- (applications.status is text, no enum constraint, so this is safe)

-- RLS
ALTER TABLE gig_escrows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view escrows they're involved in"
  ON gig_escrows FOR SELECT
  USING (auth.uid() = poster_id OR auth.uid() = worker_id);

CREATE POLICY "Posters can create escrows"
  ON gig_escrows FOR INSERT
  WITH CHECK (auth.uid() = poster_id);

CREATE POLICY "Posters can update their escrows"
  ON gig_escrows FOR UPDATE
  USING (auth.uid() = poster_id);
