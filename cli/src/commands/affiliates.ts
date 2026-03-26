import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import {
  printTable,
  printDetail,
  printSuccess,
  type OutputOptions,
  relativeDate,
  truncate,
} from "../output.js";

export function registerAffiliatesCommands(program: Command): void {
  const affiliates = program
    .command("affiliates")
    .description("Affiliate marketplace management");

  // ── List offers ────────────────────────────────────────────────

  affiliates
    .command("list")
    .description("List active affiliate offers")
    .option("--category <cat>", "Filter by category")
    .option("--tag <tag>", "Filter by tag")
    .option("--search <query>", "Search by title/description")
    .option("--sort <sort>", "Sort: newest|popular|commission")
    .option("--page <n>", "Page number", "1")
    .action(
      async (cmdOpts: {
        category?: string;
        tag?: string;
        search?: string;
        sort?: string;
        page?: string;
      }) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Fetching affiliate offers...").start();
        try {
          const client = createClient(opts);
          const result = await client.get<{
            offers: Record<string, unknown>[];
            total: number;
          }>("/api/affiliates/offers", {
            category: cmdOpts.category,
            tag: cmdOpts.tag,
            q: cmdOpts.search,
            sort: cmdOpts.sort,
            page: cmdOpts.page,
          });
          spinner?.stop();
          printTable(
            [
              { header: "ID", key: "id", width: 10, transform: truncate(8) },
              { header: "Title", key: "title", width: 30, transform: truncate(28) },
              { header: "Commission", key: "commission_rate", width: 12, transform: (v) => `${v}%` },
              { header: "Type", key: "commission_type", width: 12 },
              { header: "Status", key: "status", width: 10 },
              { header: "Created", key: "created_at", transform: relativeDate },
            ],
            result.offers,
            opts as OutputOptions,
          );
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      },
    );

  // ── View offer detail ──────────────────────────────────────────

  affiliates
    .command("view <id>")
    .description("View details of an affiliate offer")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching offer...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{
          offer: Record<string, unknown>;
        }>(`/api/affiliates/offers/${id}`);
        spinner?.stop();
        printDetail(
          [
            { label: "ID", key: "id" },
            { label: "Title", key: "title" },
            { label: "Description", key: "description" },
            { label: "Commission Rate", key: "commission_rate", transform: (v) => `${v}%` },
            { label: "Commission Type", key: "commission_type" },
            { label: "Status", key: "status" },
            { label: "Created", key: "created_at", transform: (v) => relativeDate(v) },
          ],
          result.offer || (result as unknown as Record<string, unknown>),
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Create offer ───────────────────────────────────────────────

  affiliates
    .command("create")
    .description("Create a new affiliate offer")
    .requiredOption("--title <title>", "Offer title")
    .requiredOption("--description <text>", "Offer description")
    .requiredOption("--commission-rate <rate>", "Commission rate percentage")
    .option("--commission-type <type>", "Commission type: percentage|flat", "percentage")
    .option("--commission-flat-sats <sats>", "Flat commission amount in sats")
    .option("--category <cat>", "Category")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--product-url <url>", "Product URL")
    .option("--listing-id <id>", "Linked skill listing ID")
    .action(
      async (cmdOpts: {
        title: string;
        description: string;
        commissionRate: string;
        commissionType?: string;
        commissionFlatSats?: string;
        category?: string;
        tags?: string;
        productUrl?: string;
        listingId?: string;
      }) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Creating affiliate offer...").start();
        try {
          const client = createClient(opts);
          const body: Record<string, unknown> = {
            title: cmdOpts.title,
            description: cmdOpts.description,
            commission_rate: parseFloat(cmdOpts.commissionRate),
            commission_type: cmdOpts.commissionType || "percentage",
          };
          if (cmdOpts.commissionFlatSats) body.commission_flat_sats = parseInt(cmdOpts.commissionFlatSats, 10);
          if (cmdOpts.category) body.category = cmdOpts.category;
          if (cmdOpts.tags) body.tags = cmdOpts.tags.split(",").map((t) => t.trim());
          if (cmdOpts.productUrl) body.product_url = cmdOpts.productUrl;
          if (cmdOpts.listingId) body.listing_id = cmdOpts.listingId;

          const result = await client.post<{
            offer: Record<string, unknown>;
          }>("/api/affiliates/offers", body);
          spinner?.stop();
          printSuccess("Affiliate offer created", opts as OutputOptions);
          printDetail(
            [
              { label: "ID", key: "id" },
              { label: "Title", key: "title" },
              { label: "Slug", key: "slug" },
              { label: "Status", key: "status" },
            ],
            result.offer || (result as unknown as Record<string, unknown>),
            opts as OutputOptions,
          );
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      },
    );

  // ── Update offer ───────────────────────────────────────────────

  affiliates
    .command("update <id>")
    .description("Update an affiliate offer")
    .option("--title <title>", "Offer title")
    .option("--description <text>", "Offer description")
    .option("--commission-rate <rate>", "Commission rate percentage")
    .option("--commission-type <type>", "Commission type: percentage|flat")
    .option("--category <cat>", "Category")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--status <status>", "Status: active|paused|archived")
    .action(
      async (
        id: string,
        cmdOpts: {
          title?: string;
          description?: string;
          commissionRate?: string;
          commissionType?: string;
          category?: string;
          tags?: string;
          status?: string;
        },
      ) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Updating affiliate offer...").start();
        try {
          const client = createClient(opts);
          const body: Record<string, unknown> = {};
          if (cmdOpts.title) body.title = cmdOpts.title;
          if (cmdOpts.description) body.description = cmdOpts.description;
          if (cmdOpts.commissionRate) body.commission_rate = parseFloat(cmdOpts.commissionRate);
          if (cmdOpts.commissionType) body.commission_type = cmdOpts.commissionType;
          if (cmdOpts.category) body.category = cmdOpts.category;
          if (cmdOpts.tags) body.tags = cmdOpts.tags.split(",").map((t) => t.trim());
          if (cmdOpts.status) body.status = cmdOpts.status;

          const result = await client.patch<{
            offer: Record<string, unknown>;
          }>(`/api/affiliates/offers/${id}`, body);
          spinner?.stop();
          printSuccess(`Affiliate offer updated: ${id}`, opts as OutputOptions);
          printDetail(
            [
              { label: "ID", key: "id" },
              { label: "Title", key: "title" },
              { label: "Status", key: "status" },
            ],
            result.offer || (result as unknown as Record<string, unknown>),
            opts as OutputOptions,
          );
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      },
    );

  // ── My affiliate dashboard ─────────────────────────────────────

  affiliates
    .command("mine")
    .description("View your affiliate dashboard")
    .option("--view <view>", "View: affiliate|seller", "affiliate")
    .action(async (cmdOpts: { view?: string }) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching your affiliate data...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{
          offers?: Record<string, unknown>[];
          applications?: Record<string, unknown>[];
          stats?: Record<string, unknown>;
          view: string;
        }>("/api/affiliates/my", { view: cmdOpts.view });
        spinner?.stop();

        if (result.view === "seller" && result.offers) {
          printTable(
            [
              { header: "ID", key: "id", width: 10, transform: truncate(8) },
              { header: "Title", key: "title", width: 30, transform: truncate(28) },
              { header: "Commission", key: "commission_rate", width: 12, transform: (v) => `${v}%` },
              { header: "Status", key: "status", width: 10 },
              { header: "Affiliates", key: "total_affiliates", width: 10 },
            ],
            result.offers,
            opts as OutputOptions,
          );
        } else if (result.applications) {
          printTable(
            [
              { header: "Offer", key: "offer_title", width: 30, transform: truncate(28) },
              { header: "Status", key: "status", width: 12 },
              { header: "Tracking Code", key: "tracking_code", width: 16 },
              { header: "Applied", key: "created_at", transform: relativeDate },
            ],
            result.applications.map((a: Record<string, unknown>) => ({
              ...a,
              offer_title: (a.affiliate_offers as Record<string, unknown>)?.title || "—",
            })),
            opts as OutputOptions,
          );
        }

        if (result.stats) {
          printDetail(
            [
              { label: "Total Offers", key: "total_offers" },
              { label: "Total Revenue (sats)", key: "total_revenue_sats" },
              { label: "Total Commissions (sats)", key: "total_commissions_sats" },
              { label: "Total Affiliates", key: "total_affiliates" },
            ],
            result.stats,
            opts as OutputOptions,
          );
        }
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Apply to an offer ──────────────────────────────────────────

  affiliates
    .command("apply <id>")
    .description("Apply to become an affiliate for an offer")
    .option("--note <text>", "Application note")
    .action(async (id: string, cmdOpts: { note?: string }) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Applying to offer...").start();
      try {
        const client = createClient(opts);
        const body: Record<string, unknown> = {};
        if (cmdOpts.note) body.note = cmdOpts.note;

        const result = await client.post<{
          application: Record<string, unknown>;
        }>(`/api/affiliates/offers/${id}/apply`, body);
        spinner?.stop();
        printSuccess("Applied to affiliate offer", opts as OutputOptions);
        printDetail(
          [
            { label: "Application ID", key: "id" },
            { label: "Status", key: "status" },
            { label: "Tracking Code", key: "tracking_code" },
          ],
          result.application || (result as unknown as Record<string, unknown>),
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── View conversions ───────────────────────────────────────────

  affiliates
    .command("conversions <id>")
    .description("View conversions for an affiliate offer")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching conversions...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{
          conversions: Record<string, unknown>[];
        }>(`/api/affiliates/offers/${id}/conversions`);
        spinner?.stop();
        printTable(
          [
            { header: "ID", key: "id", width: 10, transform: truncate(8) },
            { header: "Affiliate", key: "affiliate_username", width: 20 },
            { header: "Amount (sats)", key: "amount_sats", width: 14 },
            { header: "Commission (sats)", key: "commission_sats", width: 16 },
            { header: "Status", key: "status", width: 10 },
            { header: "Date", key: "created_at", transform: relativeDate },
          ],
          result.conversions || [],
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });
}
