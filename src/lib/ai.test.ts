// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AiRouter } from "@profullstack/ai-providers";
import { createAiProviders } from "@profullstack/ai-providers";
import { generateListingDescription, generateListingTags } from "./ai";

// The package keeps one router per process. Each test gets its own instead, so
// parking from one test does not decide the next.
const current = vi.hoisted(() => ({ ai: undefined as unknown as AiRouter }));

vi.mock("@profullstack/ai-providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@profullstack/ai-providers")>()),
  generateText: (req: never) => current.ai.generateText(req),
  generateObject: (req: never) => current.ai.generateObject(req),
}));

const C0MPUTE = "https://infernetprotocol.com";

function sse(answer: string): Response {
  const body = `event: token\ndata: ${JSON.stringify({ text: answer })}\n\nevent: done\ndata: {}\n\n`;
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

function c0mputeAnswers(answer: string) {
  return vi.fn(async (url: string) => {
    if (url === `${C0MPUTE}/api/chat`) {
      return Response.json({ jobId: "job-1", source: "p2p", model: "m" });
    }
    if (url === `${C0MPUTE}/api/chat/stream/job-1`) return sse(answer);
    throw new Error(`unexpected fetch ${url}`);
  });
}

function everyProviderIsDown() {
  return vi.fn(async (url: string) => {
    if (url.startsWith(C0MPUTE)) return Response.json({ error: "no node" }, { status: 503 });
    return Response.json({ error: { message: "Incorrect API key" } }, { status: 401 });
  });
}

const listing = { title: "Ripgrep", description: "fast grep", url: "https://example.com" };

function useProviders(fetchImpl: ReturnType<typeof vi.fn>) {
  const fetch = fetchImpl as unknown as typeof globalThis.fetch;
  current.ai = createAiProviders({
    env: { C0MPUTE_API_KEY: "ik_live_test", OPENAI_API_KEY: "sk-dead" },
    c0mpute: { fetch },
    openai: { fetch },
  });
}

describe("listing AI routing", () => {
  it("answers from c0mpute without touching the frontier key", async () => {
    const fetchImpl = c0mputeAnswers('{"tags": [" CLI ", "search", 3]}');
    useProviders(fetchImpl);

    await expect(generateListingTags(listing)).resolves.toEqual(["cli", "search"]);
    const urls = fetchImpl.mock.calls.map(([url]) => url);
    expect(urls.every((url) => url.startsWith(C0MPUTE))).toBe(true);
  });

  it("accepts a bare array of tags", async () => {
    useProviders(c0mputeAnswers('["cli"]'));
    await expect(generateListingTags(listing)).resolves.toEqual(["cli"]);
  });

  it("strips a thinking block from a description", async () => {
    useProviders(c0mputeAnswers("<think>hmm</think> Searches directories for regex patterns."));
    await expect(
      generateListingDescription({
        title: "Ripgrep",
        existingDescription: "",
        pageText: "",
        url: listing.url,
      }),
    ).resolves.toBe("Searches directories for regex patterns.");
  });

  it("tries the frontier fallback, then throws so the caller's fallback runs", async () => {
    const fetchImpl = everyProviderIsDown();
    useProviders(fetchImpl);

    await expect(generateListingTags(listing)).rejects.toThrow(/AI generation failed/);
    const urls = fetchImpl.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toBe(`${C0MPUTE}/api/chat`);
    expect(urls.at(-1)).toContain("api.openai.com");
  });
});
