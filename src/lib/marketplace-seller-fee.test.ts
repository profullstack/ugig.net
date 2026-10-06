import { describe, it, expect } from "vitest";
import { getSellerFeeRate as skillRate } from "@/lib/skills/purchase";
import { getSellerFeeRate as mcpRate } from "@/lib/mcp/purchase";
import { getSellerFeeRate as promptRate } from "@/lib/prompts/purchase";
import { SKILL_FEE_RATES, MCP_FEE_RATES, PROMPT_FEE_RATES } from "@/lib/constants";

describe("marketplace seller fee: Lifetime equals Pro", () => {
  const cases = [
    ["skills", skillRate, SKILL_FEE_RATES],
    ["mcp", mcpRate, MCP_FEE_RATES],
    ["prompts", promptRate, PROMPT_FEE_RATES],
  ] as const;

  for (const [name, rate, rates] of cases) {
    it(`${name}: pro and lifetime pay the reduced rate, free pays the full rate`, () => {
      expect(rate("pro")).toBe(rates.pro);
      expect(rate("lifetime")).toBe(rates.pro);
      expect(rate("free")).toBe(rates.free);
      expect(rate(null)).toBe(rates.free);
    });
  }
});
