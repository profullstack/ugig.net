import type { Command } from "commander";
import ora from "ora";
import { createClient, createUnauthClient, handleError, type GlobalOpts } from "../helpers.js";
import {
  printTable,
  printDetail,
  printSuccess,
  type OutputOptions,
  truncateId,
  truncate,
  relativeDate,
  formatDate,
} from "../output.js";

export function registerCommentsCommands(program: Command): void {
  const comments = program
    .command("comments")
    .description("Manage gig Q&A comments");

  comments
    .command("list <gigId>")
    .description("List comments for a gig")
    .action(async (gigId: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching comments...").start();
      try {
        const client = createUnauthClient(opts);
        const result = await client.get<{
          comments: Array<Record<string, unknown> & { replies: Record<string, unknown>[] }>;
          total: number;
        }>(`/api/gigs/${gigId}/comments`);
        spinner?.stop();

        // Flatten threads for table display
        const rows: Record<string, unknown>[] = [];
        for (const thread of result.comments) {
          const author = thread.author as Record<string, unknown> | null;
          rows.push({
            ...thread,
            author_name: author ? (author.full_name || author.username) : "Unknown",
            type: "question",
          });
          if (Array.isArray(thread.replies)) {
            for (const reply of thread.replies) {
              const replyAuthor = reply.author as Record<string, unknown> | null;
              rows.push({
                ...reply,
                author_name: replyAuthor ? (replyAuthor.full_name || replyAuthor.username) : "Unknown",
                type: "  └ reply",
              });
            }
          }
        }

        printTable(
          [
            { header: "ID", key: "id", width: 12, transform: truncateId },
            { header: "Type", key: "type", width: 12 },
            { header: "Author", key: "author_name", width: 18, transform: truncate(16) },
            { header: "Content", key: "content", width: 40, transform: truncate(38) },
            { header: "Date", key: "created_at", transform: relativeDate },
          ],
          rows,
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed to fetch comments");
        handleError(err, opts as OutputOptions);
      }
    });

  comments
    .command("create <gigId>")
    .description("Post a comment or question on a gig")
    .requiredOption("--content <text>", "Comment content")
    .option("--parent-id <id>", "Parent comment ID (for replies)")
    .action(async (gigId: string, options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Posting comment...").start();
      try {
        const client = createClient(opts);
        const body: Record<string, unknown> = {
          content: options.content,
        };
        if (options.parentId) body.parent_id = options.parentId;
        const result = await client.post<{ comment: Record<string, unknown> }>(
          `/api/gigs/${gigId}/comments`,
          body
        );
        spinner?.succeed("Comment posted");
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printSuccess(`Comment posted: ${result.comment.id}`, opts as OutputOptions);
        }
      } catch (err) {
        spinner?.fail("Failed to post comment");
        handleError(err, opts as OutputOptions);
      }
    });

  comments
    .command("update <gigId> <commentId>")
    .description("Update a comment")
    .requiredOption("--content <text>", "New comment content")
    .action(async (gigId: string, commentId: string, options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Updating comment...").start();
      try {
        const client = createClient(opts);
        await client.put(`/api/gigs/${gigId}/comments/${commentId}`, {
          content: options.content,
        });
        spinner?.succeed("Comment updated");
        printSuccess("Comment updated.", opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed to update comment");
        handleError(err, opts as OutputOptions);
      }
    });

  comments
    .command("delete <gigId> <commentId>")
    .description("Delete a comment")
    .action(async (gigId: string, commentId: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Deleting comment...").start();
      try {
        const client = createClient(opts);
        await client.delete(`/api/gigs/${gigId}/comments/${commentId}`);
        spinner?.succeed("Comment deleted");
        printSuccess("Comment deleted.", opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed to delete comment");
        handleError(err, opts as OutputOptions);
      }
    });
}
