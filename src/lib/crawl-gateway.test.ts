import { describe, it, expect, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { gate, gateway } from "./crawl-gateway";
import { GET as robots } from "@/app/robots.txt/route";
import { proxy } from "../../proxy";

// proxy.ts refreshes the Supabase session after the gateway; stub it so the
// composition test proves the order without a Supabase client.
const updateSession = vi.fn<(request: NextRequest) => Promise<NextResponse>>(async () =>
  NextResponse.next(),
);
vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: (request: NextRequest) => updateSession(request),
}));

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const META = "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)";
const GPTBOT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";

const request = (path: string, userAgent: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://ugig.net${path}`, {
    headers: { "user-agent": userAgent, ...headers },
  });

/** The rule lines of one `User-agent:` group in a robots.txt. */
function group(text: string, agent: string): string[] {
  const lines = text.split("\n");
  const start = lines.indexOf(`User-agent: ${agent}`);
  if (start < 0) return [];
  const rules: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) break;
    rules.push(line);
  }
  return rules;
}

describe("robots.txt route", () => {
  const text = async () => {
    const res = robots();
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    return res.text();
  };

  it("refuses training crawlers everywhere but the sales page", async () => {
    const body = await text();
    for (const agent of ["GPTBot", "meta-externalagent"]) {
      const rules = group(body, agent);
      expect(rules, agent).toContain("Disallow: /");
      expect(rules, agent).toContain("Allow: /crawl");
    }
  });

  it("names retrieval crawlers as welcome", async () => {
    const rules = group(await text(), "OAI-SearchBot");
    expect(rules).toContain("Allow: /");
    expect(rules).not.toContain("Disallow: /");
  });

  it("keeps the private paths out of every welcome group", async () => {
    const body = await text();
    for (const agent of ["*", "OAI-SearchBot", "Claude-SearchBot"]) {
      const rules = group(body, agent);
      expect(rules, agent).toContain("Disallow: /dashboard/");
      expect(rules, agent).toContain("Disallow: /api/");
      expect(rules, agent).toContain("Disallow: /profile/edit");
    }
    expect(body).toContain("Sitemap: https://ugig.net/sitemap.xml");
  });
});

describe("crawl gateway", () => {
  it("is configured for ugig.net", () => {
    expect(gateway.options.siteUrl).toBe("https://ugig.net");
    expect(gateway.options.path).toBe("/crawl");
    expect(gateway.options.header).toBe("x-crawl-pass");
  });

  it("answers a training crawler with 402 and an x402 offer", async () => {
    const res = await gate(request("/gigs/anything", META));
    expect(res?.status).toBe(402);
    expect(res?.headers.get("content-type")).toMatch(/^application\/json/);
    const body = await res!.json();
    expect(body.x402Version).toBe(2);
    expect(Array.isArray(body.accepts)).toBe(true);
    expect(body.pass.buy).toBe("https://ugig.net/crawl");
    expect(body.pass.header).toBe("x-crawl-pass");
  });

  it("charges a training crawler on API routes too", async () => {
    const res = await gate(request("/api/gigs", GPTBOT));
    expect(res?.status).toBe(402);
  });

  it("serves a training crawler the HTML sales page when it asks for HTML", async () => {
    const res = await gate(request("/", GPTBOT, { accept: "text/html" }));
    expect(res?.status).toBe(402);
    expect(res?.headers.get("content-type")).toMatch(/^text\/html/);
  });

  it("lets a training crawler read robots.txt and the sales page", async () => {
    expect(await gate(request("/robots.txt", GPTBOT))).toBeUndefined();
    const crawl = await gate(request("/crawl", GPTBOT));
    expect(crawl?.status).toBe(402);
  });

  it("passes people and retrieval crawlers through", async () => {
    const welcome = [
      CHROME,
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)",
      "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
    ];
    for (const ua of welcome) {
      expect(await gate(request("/gigs/anything", ua)), ua).toBeUndefined();
    }
  });
});

describe("proxy composition", () => {
  it("answers a training crawler before the session middleware runs", async () => {
    updateSession.mockClear();
    const res = await proxy(request("/gigs/anything", META));
    expect(res?.status).toBe(402);
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("hands a person's request on to the session middleware", async () => {
    updateSession.mockClear();
    const res = await proxy(request("/gigs/anything", CHROME));
    expect(res?.status).toBe(200);
    expect(updateSession).toHaveBeenCalledTimes(1);
  });
});
