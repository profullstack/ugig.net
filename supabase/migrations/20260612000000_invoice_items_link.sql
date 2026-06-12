-- Optional link per invoice line item, so a charge like
-- "Pull requests (8 x $1.00)" can point at the merged GitHub PRs it bills for.
alter table gig_invoice_items
  add column if not exists link text;
