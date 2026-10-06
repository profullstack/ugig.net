import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /llms.txt", () => {
  it("serves a plain-text index linking every machine-readable surface", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    const body = await res.text();
    expect(body.startsWith("# ugig.net")).toBe(true);
    for (const path of ["/skill.md", "/docs", "/docs/cli", "/api/openapi.json", "/install.sh"]) {
      expect(body).toContain(`https://ugig.net${path}`);
    }
  });
});
