import type { Command } from "commander";
import ora from "ora";
import { createClient, createUnauthClient, handleError, type GlobalOpts } from "../helpers.js";
import {
  printDetail, printSuccess, type OutputOptions,
  relativeDate, formatArray,
} from "../output.js";

export function registerPostCommands(program: Command): void {
  const post = program
    .command("post")
    .description("Create and manage posts");

  // ugig post create "content" or ugig post "content" (shortcut is the default action)
  post
    .command("create <content>")
    .description("Create a new post")
    .option("--url <url>", "Attach a link")
    .option("--tags <tags>", "Comma-separated tags")
    .action(async (content: string, options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Creating post...").start();
      try {
        const client = createClient(opts);
        const tags = options.tags
          ? options.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
          : [];

        const result = await client.post<{ post: Record<string, unknown> }>("/api/posts", {
          content,
          url: options.url || null,
          tags,
        });
        spinner?.succeed("Post created!");

        printDetail(
          [
            { label: "ID", key: "id" },
            { label: "Content", key: "content" },
            { label: "URL", key: "url" },
            { label: "Tags", key: "tags", transform: formatArray },
            { label: "Score", key: "score" },
            { label: "Created", key: "created_at", transform: relativeDate },
          ],
          result.post,
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed to create post");
        handleError(err, opts as OutputOptions);
      }
    });

  post
    .command("get <id>")
    .description("Get post details")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching post...").start();
      try {
        const client = createUnauthClient(opts);
        const result = await client.get<{ post: Record<string, unknown> }>(`/api/posts/${id}`);
        spinner?.stop();

        printDetail(
          [
            { label: "ID", key: "id" },
            { label: "Author", key: "author", transform: formatAuthor },
            { label: "Content", key: "content" },
            { label: "URL", key: "url" },
            { label: "Tags", key: "tags", transform: formatArray },
            { label: "Score", key: "score" },
            { label: "Upvotes", key: "upvotes" },
            { label: "Downvotes", key: "downvotes" },
            { label: "Views", key: "views_count" },
            { label: "Created", key: "created_at", transform: relativeDate },
          ],
          result.post,
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed to fetch post");
        handleError(err, opts as OutputOptions);
      }
    });

  post
    .command("edit <id>")
    .description("Edit a post")
    .option("--content <content>", "New content")
    .option("--url <url>", "New URL")
    .option("--tags <tags>", "New comma-separated tags")
    .action(async (id: string, options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Updating post...").start();
      try {
        const client = createClient(opts);
        const body: Record<string, unknown> = {};
        if (options.content) body.content = options.content;
        if (options.url !== undefined) body.url = options.url || null;
        if (options.tags) {
          body.tags = options.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
        }

        const result = await client.put<{ post: Record<string, unknown> }>(`/api/posts/${id}`, body);
        spinner?.succeed("Post updated!");

        printDetail(
          [
            { label: "ID", key: "id" },
            { label: "Content", key: "content" },
            { label: "Tags", key: "tags", transform: formatArray },
          ],
          result.post,
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed to update post");
        handleError(err, opts as OutputOptions);
      }
    });

  post
    .command("delete <id>")
    .description("Delete a post")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Deleting post...").start();
      try {
        const client = createClient(opts);
        await client.delete(`/api/posts/${id}`);
        spinner?.stop();
        printSuccess("Post deleted successfully", opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed to delete post");
        handleError(err, opts as OutputOptions);
      }
    });

  post
    .command("upvote <id>")
    .description("Upvote a post")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Upvoting...").start();
      try {
        const client = createClient(opts);
        const result = await client.post<Record<string, unknown>>(`/api/posts/${id}/upvote`);
        spinner?.stop();
        printSuccess(`Score: ${result.score} (your vote: ${result.user_vote === 1 ? "↑" : "none"})`, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed to upvote");
        handleError(err, opts as OutputOptions);
      }
    });

  post
    .command("downvote <id>")
    .description("Downvote a post")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Downvoting...").start();
      try {
        const client = createClient(opts);
        const result = await client.post<Record<string, unknown>>(`/api/posts/${id}/downvote`);
        spinner?.stop();
        printSuccess(`Score: ${result.score} (your vote: ${result.user_vote === -1 ? "↓" : "none"})`, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed to downvote");
        handleError(err, opts as OutputOptions);
      }
    });
}

// Register the shortcut: `ugig post "content"` as a quick-create
export function registerPostShortcut(program: Command): void {
  // This is handled by the `post create` command
}

function formatAuthor(value: unknown): string {
  if (value && typeof value === "object" && "username" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).username || "unknown");
  }
  return String(value || "unknown");
}
