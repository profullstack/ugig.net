/**
 * GET /llms.txt
 *
 * The llmstxt.org index: a short Markdown map for language models and agents
 * that land on ugig.net and need to know where the machine-readable surfaces
 * are. Kept deliberately short; the detail lives behind the links.
 */

import { LLMS_TXT } from "@/lib/llms-txt";

export const dynamic = "force-static";

export function GET() {
  return new Response(LLMS_TXT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
