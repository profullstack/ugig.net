import type { Command } from "commander";
/** poster.trust from the API: "New seller", "14 delivered · 92% on time", "verified poster". */
export declare function formatTrust(gig: Record<string, unknown>): string;
export declare function registerGigsCommands(program: Command): void;
