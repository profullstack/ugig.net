import type { Command } from "commander";
import { readFileSync } from "fs";
import { basename } from "path";
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

export function registerSkillsCommands(program: Command): void {
  const skills = program.command("skills").description("Manage skill marketplace listings");

  // ── List skills ────────────────────────────────────────────────

  skills
    .command("list")
    .description("List active skill listings")
    .option("--search <query>", "Search by title/description")
    .option("--category <cat>", "Filter by category")
    .option("--tag <tag>", "Filter by tag")
    .option("--sort <sort>", "Sort: newest|popular|rating|price_low|price_high")
    .option("--page <n>", "Page number", "1")
    .action(
      async (cmdOpts: {
        search?: string;
        category?: string;
        tag?: string;
        sort?: string;
        page?: string;
      }) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Fetching skills...").start();
        try {
          const client = createClient(opts);
          const result = await client.get<{
            listings: Record<string, unknown>[];
            total: number;
          }>("/api/skills", {
            search: cmdOpts.search,
            category: cmdOpts.category,
            tag: cmdOpts.tag,
            sort: cmdOpts.sort,
            page: cmdOpts.page,
          });
          spinner?.stop();
          printTable(
            [
              { header: "Slug", key: "slug", width: 25, transform: truncate(23) },
              { header: "Title", key: "title", width: 30, transform: truncate(28) },
              { header: "Price", key: "price_sats", width: 10, transform: (v) => `${v} sats` },
              { header: "Rating", key: "rating_avg", width: 8 },
              { header: "Downloads", key: "downloads_count", width: 10 },
              { header: "Scan", key: "scan_status", width: 10, transform: (v) => v || "—" },
              { header: "Created", key: "created_at", transform: relativeDate },
            ],
            result.listings,
            opts as OutputOptions,
          );
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      },
    );

  // ── Get skill detail ───────────────────────────────────────────

  skills
    .command("get <slug>")
    .description("Get details of a skill listing")
    .action(async (slug: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching skill...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{
          listing: Record<string, unknown>;
          purchased: boolean;
        }>(`/api/skills/${slug}`);
        spinner?.stop();
        printDetail(result.listing, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Create skill listing ───────────────────────────────────────

  skills
    .command("create")
    .description("Create a new skill listing")
    .requiredOption("--title <title>", "Skill title")
    .requiredOption("--description <text>", "Skill description")
    .option("--price <sats>", "Price in sats (0 = free)", "0")
    .option("--category <cat>", "Category")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--tagline <text>", "Short tagline")
    .option("--status <status>", "Status: draft|active", "draft")
    .option("--source-url <url>", "Source URL for metadata autofill")
    .action(
      async (cmdOpts: {
        title: string;
        description: string;
        price?: string;
        category?: string;
        tags?: string;
        tagline?: string;
        status?: string;
        sourceUrl?: string;
      }) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Creating skill listing...").start();
        try {
          const client = createClient(opts);

          // If source URL provided and no description given beyond the required, fetch metadata
          let autofilled: Record<string, unknown> = {};
          if (cmdOpts.sourceUrl) {
            try {
              const meta = await client.post<{
                metadata: {
                  title?: string;
                  description?: string;
                  imageUrl?: string;
                  tags?: string[];
                };
              }>("/api/skills/metadata", { url: cmdOpts.sourceUrl });
              autofilled = meta.metadata;
              if (!opts.json) {
                spinner?.info("Autofilled metadata from source URL");
                spinner?.start("Creating skill listing...");
              }
            } catch {
              if (!opts.json) {
                spinner?.warn("Could not fetch metadata from source URL, continuing...");
                spinner?.start("Creating skill listing...");
              }
            }
          }

          const body: Record<string, unknown> = {
            title: cmdOpts.title || autofilled.title,
            description: cmdOpts.description || autofilled.description,
            price_sats: parseInt(cmdOpts.price || "0", 10),
            status: cmdOpts.status || "draft",
          };
          if (cmdOpts.category) body.category = cmdOpts.category;
          if (cmdOpts.tagline) body.tagline = cmdOpts.tagline;
          if (cmdOpts.tags) {
            body.tags = cmdOpts.tags.split(",").map((t) => t.trim());
          } else if (autofilled.tags && Array.isArray(autofilled.tags)) {
            body.tags = autofilled.tags;
          }
          if (cmdOpts.sourceUrl) body.source_url = cmdOpts.sourceUrl;

          const result = await client.post<{
            listing: Record<string, unknown>;
          }>("/api/skills", body);
          spinner?.stop();
          printSuccess(
            `Skill listing created: ${(result.listing as any).slug}`,
            opts as OutputOptions,
          );
          printDetail(result.listing, opts as OutputOptions);
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      },
    );

  // ── Update skill listing ───────────────────────────────────────

  skills
    .command("update <slug>")
    .description("Update a skill listing")
    .option("--title <title>", "Skill title")
    .option("--description <text>", "Skill description")
    .option("--price <sats>", "Price in sats")
    .option("--category <cat>", "Category")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--tagline <text>", "Short tagline")
    .option("--status <status>", "Status: draft|active")
    .option("--source-url <url>", "Source URL for metadata")
    .action(
      async (
        slug: string,
        cmdOpts: {
          title?: string;
          description?: string;
          price?: string;
          category?: string;
          tags?: string;
          tagline?: string;
          status?: string;
          sourceUrl?: string;
        },
      ) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Updating skill listing...").start();
        try {
          const client = createClient(opts);
          const body: Record<string, unknown> = {};
          if (cmdOpts.title) body.title = cmdOpts.title;
          if (cmdOpts.description) body.description = cmdOpts.description;
          if (cmdOpts.price) body.price_sats = parseInt(cmdOpts.price, 10);
          if (cmdOpts.category) body.category = cmdOpts.category;
          if (cmdOpts.tagline) body.tagline = cmdOpts.tagline;
          if (cmdOpts.tags) body.tags = cmdOpts.tags.split(",").map((t) => t.trim());
          if (cmdOpts.status) body.status = cmdOpts.status;
          if (cmdOpts.sourceUrl) body.source_url = cmdOpts.sourceUrl;

          const result = await client.patch<{
            listing: Record<string, unknown>;
          }>(`/api/skills/${slug}`, body);
          spinner?.stop();
          printSuccess(`Skill listing updated: ${slug}`, opts as OutputOptions);
          printDetail(result.listing, opts as OutputOptions);
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      },
    );

  // ── Upload skill file ──────────────────────────────────────────

  skills
    .command("upload <listing-id> <file-path>")
    .description("Upload a skill file (runs security scan before accepting)")
    .action(async (listingId: string, filePath: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Uploading and scanning skill file...").start();
      try {
        const client = createClient(opts);
        const fileBuffer = readFileSync(filePath);
        const fileName = basename(filePath);

        // Determine MIME type from extension
        const ext = fileName.split(".").pop()?.toLowerCase() || "";
        const mimeTypes: Record<string, string> = {
          ts: "text/typescript",
          js: "application/javascript",
          json: "application/json",
          yaml: "text/yaml",
          yml: "text/yaml",
          md: "text/markdown",
          txt: "text/plain",
          zip: "application/zip",
          tar: "application/x-tar",
          gz: "application/gzip",
          tgz: "application/gzip",
        };
        const mimeType = mimeTypes[ext] || "application/octet-stream";

        // Use the uploadFile method which handles FormData
        // We need to add listing_id to the upload
        const url = `/api/skills/upload`;
        const formData = new FormData();
        const uint8Array = new Uint8Array(fileBuffer);
        const blob = new Blob([uint8Array], { type: mimeType });
        formData.append("file", blob, fileName);
        formData.append("listing_id", listingId);

        // Make the request directly since client.uploadFile doesn't support extra fields
        const result = await client.post<{
          ok?: boolean;
          error?: string;
          file_path?: string;
          scan?: { status: string; file_hash?: string; findings?: unknown[] };
        }>(url, undefined);

        // Actually we need to use raw fetch for FormData
        // The client.uploadFile only supports file upload
        // For now, use uploadFile and add listing_id as query param
        // Actually, let's extend the approach:

        spinner?.stop();

        // Re-implement with raw fetch
        const baseUrl = (client as any).baseUrl || process.env.UGIG_BASE_URL || "https://ugig.net";
        const apiKey = (client as any).apiKey || process.env.UGIG_API_KEY;

        const headers: Record<string, string> = { "User-Agent": "ugig-cli/0.1.0" };
        if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

        const fd = new FormData();
        fd.append("file", blob, fileName);
        fd.append("listing_id", listingId);

        const response = await fetch(`${baseUrl}/api/skills/upload`, {
          method: "POST",
          headers,
          body: fd,
        });

        const data = await response.json();

        if (!response.ok) {
          if (data.scan) {
            if (!opts.json) {
              console.error(`\n❌ Security scan failed: ${data.scan.status}`);
              if (data.scan.findings?.length) {
                console.error("\nFindings:");
                for (const f of data.scan.findings) {
                  console.error(`  • [${(f as any).severity}] ${(f as any).detail}`);
                }
              }
            }
          }
          throw new Error(data.error || `Upload failed (${response.status})`);
        }

        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(`\n✅ File uploaded and scan passed`);
          console.log(`   Path: ${data.file_path}`);
          console.log(`   Hash: ${data.scan?.file_hash}`);
          console.log(`   Scan: ${data.scan?.status}`);
        }
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Fetch metadata preview ─────────────────────────────────────

  skills
    .command("metadata <url>")
    .description("Preview metadata extracted from a URL")
    .action(async (url: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching metadata...").start();
      try {
        const client = createClient(opts);
        const result = await client.post<{
          metadata: Record<string, unknown>;
        }>("/api/skills/metadata", { url });
        spinner?.stop();
        printDetail(result.metadata, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── My listings ────────────────────────────────────────────────

  skills
    .command("my")
    .description("List your own skill listings")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching your skills...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{
          listings: Record<string, unknown>[];
        }>("/api/skills/my");
        spinner?.stop();
        printTable(
          [
            { header: "Slug", key: "slug", width: 25, transform: truncate(23) },
            { header: "Title", key: "title", width: 30, transform: truncate(28) },
            { header: "Status", key: "status", width: 10 },
            { header: "Scan", key: "scan_status", width: 10, transform: (v) => v || "—" },
            { header: "Price", key: "price_sats", width: 10, transform: (v) => `${v} sats` },
            { header: "Downloads", key: "downloads_count", width: 10 },
          ],
          result.listings,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Publish (activate) a skill ──────────────────────────────────

  skills
    .command("publish <slug>")
    .description("Publish a skill listing (set status to active)")
    .action(async (slug: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora(`Publishing ${slug}...`).start();
      try {
        const client = createClient(opts);
        const result = await client.patch<{
          listing: Record<string, unknown>;
        }>(`/api/skills/${slug}`, { status: "active" });
        spinner?.stop();
        printSuccess(`Skill published: ${slug}`, opts as OutputOptions);
        printDetail(result.listing, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Publish all draft skills ───────────────────────────────────

  skills
    .command("publish-all")
    .description("Publish all your draft skill listings")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching draft skills...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{
          listings: Record<string, unknown>[];
        }>("/api/skills/my");

        const drafts = (result.listings || []).filter(
          (l: any) => l.status === "draft",
        );

        if (drafts.length === 0) {
          spinner?.stop();
          printSuccess("No draft skills to publish", opts as OutputOptions);
          return;
        }

        if (spinner) spinner.text = `Publishing ${drafts.length} draft skill(s)...`;

        let published = 0;
        let failed = 0;

        for (const skill of drafts) {
          try {
            await client.patch(`/api/skills/${(skill as any).slug}`, {
              status: "active",
            });
            published++;
          } catch {
            failed++;
          }
        }

        spinner?.stop();
        printSuccess(
          `Published ${published} skill(s)${failed > 0 ? `, ${failed} failed` : ""}`,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Delete listing ─────────────────────────────────────────────

  skills
    .command("delete <slug>")
    .description("Archive (soft-delete) a skill listing")
    .action(async (slug: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Deleting skill listing...").start();
      try {
        const client = createClient(opts);
        await client.delete(`/api/skills/${slug}`);
        spinner?.stop();
        printSuccess(`Skill listing archived: ${slug}`, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });
}
