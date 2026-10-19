-- Trust signals for listings: "N delivered, X% on time" for sellers, and a
-- "verified poster" mark for people who have actually paid someone on ugig.
--
-- Both read gig_invoices and gig_orders, which RLS shows only to the two
-- parties, so they run as the definer and return counts only (never amounts,
-- counterparties or ids). Every number comes from a recorded event; nothing is
-- estimated, so a user with no history gets no row and the UI says "New".
--
-- delivered_count   distinct jobs delivered: a hired application with a PAID
--                   gig invoice (the worker billed, the poster paid), plus
--                   Buy-now orders the seller marked delivered (delivered or
--                   released).
-- on_time_measured  jobs that had a deadline we can check. Only Buy-now orders
--                   have one (the escrow expiry). A funded order that reached
--                   its expiry undelivered counts as measured and late.
-- on_time_count     measured jobs delivered on or before the deadline.
-- paid_count        distinct jobs this user paid for as a poster/buyer (paid
--                   invoices + funded Buy-now orders). >= 1 = verified poster.

CREATE OR REPLACE FUNCTION public.seller_trust_stats(user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  delivered_count integer,
  on_time_measured integer,
  on_time_count integer,
  paid_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT DISTINCT unnest(user_ids) AS id LIMIT 500
  ),
  inv_delivered AS (
    SELECT i.worker_id AS id, count(DISTINCT i.application_id) AS n
      FROM gig_invoices i JOIN ids ON ids.id = i.worker_id
     WHERE i.status = 'paid'
     GROUP BY 1
  ),
  ord AS (
    SELECT o.seller_id AS id,
           count(*) FILTER (WHERE o.delivered_at IS NOT NULL
                              AND o.status IN ('delivered', 'released')) AS delivered,
           count(*) FILTER (WHERE o.funded_at IS NOT NULL AND o.expires_at IS NOT NULL
                              AND (o.delivered_at IS NOT NULL OR o.expires_at < now())) AS measured,
           count(*) FILTER (WHERE o.delivered_at IS NOT NULL AND o.expires_at IS NOT NULL
                              AND o.delivered_at <= o.expires_at) AS on_time
      FROM gig_orders o JOIN ids ON ids.id = o.seller_id
     GROUP BY 1
  ),
  paid AS (
    SELECT id, sum(n) AS n FROM (
      SELECT i.poster_id AS id, count(DISTINCT i.application_id) AS n
        FROM gig_invoices i JOIN ids ON ids.id = i.poster_id
       WHERE i.status = 'paid'
       GROUP BY 1
      UNION ALL
      SELECT o.buyer_id, count(*)
        FROM gig_orders o JOIN ids ON ids.id = o.buyer_id
       WHERE o.funded_at IS NOT NULL
       GROUP BY 1
    ) p GROUP BY id
  )
  SELECT ids.id,
         (COALESCE(inv_delivered.n, 0) + COALESCE(ord.delivered, 0))::integer,
         COALESCE(ord.measured, 0)::integer,
         COALESCE(ord.on_time, 0)::integer,
         COALESCE(paid.n, 0)::integer
    FROM ids
    LEFT JOIN inv_delivered ON inv_delivered.id = ids.id
    LEFT JOIN ord ON ord.id = ids.id
    LEFT JOIN paid ON paid.id = ids.id;
$$;

REVOKE ALL ON FUNCTION public.seller_trust_stats(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_trust_stats(uuid[]) TO anon, authenticated, service_role;

-- Everyone who has paid at least one worker: the "verified poster" set the
-- hiring board ranks first. Small (people who actually pay), so the app reads
-- it whole instead of joining per listing.
CREATE OR REPLACE FUNCTION public.verified_poster_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT poster_id FROM gig_invoices WHERE status = 'paid'
  UNION
  SELECT buyer_id FROM gig_orders WHERE funded_at IS NOT NULL
  UNION
  SELECT id FROM profiles WHERE verified IS TRUE;
$$;

REVOKE ALL ON FUNCTION public.verified_poster_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verified_poster_ids() TO anon, authenticated, service_role;
