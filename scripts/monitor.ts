#!/usr/bin/env npx tsx
/**
 * Monitor Service — Long-running worker for scheduled tasks.
 * 
 * Deploy as a separate Railway service with:
 *   npx tsx scripts/monitor.ts
 * 
 * Env vars needed:
 *   CRON_SECRET — shared secret for API auth
 *   APP_URL — base URL (default: https://ugig.net)
 */

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error("❌ CRON_SECRET env var is required");
  process.exit(1);
}

interface Task {
  name: string;
  endpoint: string;
  intervalMs: number;
  lastRun: number;
}

const tasks: Task[] = [
  {
    name: "archive-conversations",
    endpoint: "/api/cron/archive-conversations",
    intervalMs: 6 * 60 * 60 * 1000, // every 6 hours
    lastRun: 0,
  },
  {
    name: "profile-reminders",
    endpoint: "/api/cron/profile-reminders",
    intervalMs: 24 * 60 * 60 * 1000, // daily
    lastRun: 0,
  },
  {
    name: "affiliate-payouts",
    endpoint: "/api/cron/affiliate-payouts",
    intervalMs: 24 * 60 * 60 * 1000, // daily
    lastRun: 0,
  },
];

async function runTask(task: Task): Promise<void> {
  const url = `${APP_URL}${task.endpoint}`;
  const started = Date.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-cron-secret": CRON_SECRET!,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });

    const body = await res.text();
    const elapsed = Date.now() - started;

    if (res.ok) {
      console.log(`✅ [${task.name}] ${res.status} (${elapsed}ms) ${body.slice(0, 200)}`);
    } else {
      console.error(`❌ [${task.name}] ${res.status} (${elapsed}ms) ${body.slice(0, 200)}`);
    }
  } catch (err) {
    const elapsed = Date.now() - started;
    console.error(`❌ [${task.name}] failed (${elapsed}ms):`, err instanceof Error ? err.message : err);
  }

  task.lastRun = Date.now();
}

async function tick(): Promise<void> {
  const now = Date.now();

  for (const task of tasks) {
    if (now - task.lastRun >= task.intervalMs) {
      await runTask(task);
    }
  }
}

async function main(): Promise<void> {
  console.log(`\n🔄 ugig.net Monitor Service`);
  console.log(`   URL: ${APP_URL}`);
  console.log(`   Tasks: ${tasks.map(t => `${t.name} (every ${t.intervalMs / 60000}m)`).join(", ")}`);
  console.log(`   Started: ${new Date().toISOString()}\n`);

  // Run all tasks immediately on startup
  for (const task of tasks) {
    await runTask(task);
  }

  // Then check every 60 seconds
  const TICK_INTERVAL = 60 * 1000;
  setInterval(tick, TICK_INTERVAL);

  // Keep alive
  console.log("⏳ Monitoring... (checking every 60s)\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
