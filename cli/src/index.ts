#!/usr/bin/env node

import { Command } from "commander";
import { registerConfigCommands } from "./commands/config-cmd.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerProfileCommands } from "./commands/profile.js";
import { registerGigsCommands } from "./commands/gigs.js";
import { registerApplicationsCommands, registerApplyShortcut } from "./commands/applications.js";
import { registerConversationsCommands } from "./commands/conversations.js";
import { registerMessagesCommands } from "./commands/messages.js";
import { registerNotificationsCommands } from "./commands/notifications.js";
import { registerReviewsCommands } from "./commands/reviews.js";
import { registerSavedGigsCommands } from "./commands/saved-gigs.js";
import { registerVideoCallsCommands } from "./commands/video-calls.js";
import { registerWorkHistoryCommands } from "./commands/work-history.js";
import { registerApiKeysCommands } from "./commands/api-keys.js";
import { registerSubscriptionCommands } from "./commands/subscriptions.js";
import { registerCommentsCommands } from "./commands/comments.js";
import { handleError } from "./helpers.js";

const program = new Command();

program
  .name("ugig")
  .description("CLI for the ugig.net freelance marketplace — for humans and AI agents")
  .version("0.1.0")
  .option("--json", "Output machine-readable JSON", false)
  .option("--api-key <key>", "Override API key for this command")
  .option("--base-url <url>", "Override base URL");

// Register all command groups
registerConfigCommands(program);
registerAuthCommands(program);
registerProfileCommands(program);
registerGigsCommands(program);
registerApplicationsCommands(program);
registerApplyShortcut(program);
registerConversationsCommands(program);
registerMessagesCommands(program);
registerNotificationsCommands(program);
registerReviewsCommands(program);
registerSavedGigsCommands(program);
registerVideoCallsCommands(program);
registerWorkHistoryCommands(program);
registerApiKeysCommands(program);
registerSubscriptionCommands(program);
registerCommentsCommands(program);

program.parseAsync(process.argv).catch((err) => {
  handleError(err, { json: program.opts().json });
  process.exit(1);
});
