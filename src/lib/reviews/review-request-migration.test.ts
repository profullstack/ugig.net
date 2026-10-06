import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { HIRED_APPLICATION_STATUSES } from "@/lib/application-status";
import { Constants } from "@/types/supabase";

// The review prompt lives in SQL triggers, so pin the parts of the migration
// that must agree with the app: the hired-status list, the enum value the UI
// renders, and which status changes fire a prompt.
const dir = path.join(process.cwd(), "supabase/migrations");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
const enumSql = read("20261006132000_review_request_notification_type.sql");
const sql = read("20261006132100_reviews_both_sides.sql");

describe("review_request migration", () => {
  it("adds the notification_type value idempotently, in its own migration", () => {
    expect(enumSql).toMatch(/ALTER TYPE public\.notification_type ADD VALUE IF NOT EXISTS 'review_request'/);
    expect(sql).not.toMatch(/ADD VALUE/);
    expect(Constants.public.Enums.notification_type).toContain("review_request");
  });

  it("uses exactly HIRED_APPLICATION_STATUSES wherever it checks for a hire", () => {
    const lists = [...sql.matchAll(/ARRAY\[([^\]]+)\]/g)].map((m) =>
      m[1].split(",").map((s) => s.trim().replace(/'/g, ""))
    );
    expect(lists.length).toBeGreaterThanOrEqual(4);
    for (const list of lists) {
      expect([...list].sort()).toEqual([...HIRED_APPLICATION_STATUSES].sort());
    }
  });

  it("prompts on a paid invoice, a released escrow and a filled gig", () => {
    expect(sql).toMatch(/AFTER INSERT OR UPDATE OF status ON public\.gig_invoices[\s\S]*?review_request_on_invoice_paid/);
    expect(sql).toMatch(/AFTER INSERT OR UPDATE OF status ON public\.gig_escrows[\s\S]*?review_request_on_escrow_released/);
    expect(sql).toMatch(/AFTER UPDATE OF status ON public\.gigs[\s\S]*?review_request_on_gig_filled/);
    expect(sql).toMatch(/NEW\.status = 'paid' AND \(TG_OP = 'INSERT' OR OLD\.status IS DISTINCT FROM 'paid'\)/);
    expect(sql).toMatch(/NEW\.status = 'released' AND \(TG_OP = 'INSERT' OR OLD\.status IS DISTINCT FROM 'released'\)/);
    expect(sql).toMatch(/NEW\.status::text = 'filled' AND OLD\.status IS DISTINCT FROM NEW\.status/);
  });

  it("asks both sides, skips anyone already reviewed or already asked, and links to #review", () => {
    expect(sql).toMatch(/request_review_from\(v_gig\.poster_id, p_worker_id/);
    expect(sql).toMatch(/request_review_from\(p_worker_id, v_gig\.poster_id/);
    expect(sql).toMatch(/FROM public\.reviews r\s+WHERE r\.gig_id = p_gig_id\s+AND r\.reviewer_id = p_reviewer_id\s+AND r\.reviewee_id = p_reviewee_id/);
    expect(sql).toMatch(/n\.type::text = 'review_request'/);
    expect(sql).toContain("'/gigs/' || p_gig_id || '#review'");
    expect(sql).toMatch(/'Rate ' \|\|/);
  });

  it("never blocks the write that fired it, and is not callable over RPC", () => {
    expect((sql.match(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/g) || []).length).toBe(3);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.request_gig_reviews\(uuid, uuid, text\) FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.request_review_from\(uuid, uuid, uuid, text, text\) FROM PUBLIC/);
  });

  it("allows one review per (gig, reviewer, reviewee) so a poster can rate every hire", () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS reviews_gig_id_reviewer_id_key/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS \w+\s+ON public\.reviews \(gig_id, reviewer_id, reviewee_id\)/);
  });

  it("sends no email", () => {
    const code = sql.replace(/--.*$/gm, "");
    expect(code).not.toMatch(/email|http_post|net\./i);
  });
});
