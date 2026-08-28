import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { usersAreBlocked, getBlockedUserIds, notInFilter } from "./blocks";

const A = "00000000-0000-4000-a000-00000000000a";
const B = "00000000-0000-4000-a000-00000000000b";

function clientWith(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return {
    client: { rpc } as unknown as SupabaseClient<Database>,
    rpc,
  };
}

describe("usersAreBlocked", () => {
  it("returns true when the rpc reports a block", async () => {
    const { client, rpc } = clientWith({ data: true, error: null });

    await expect(usersAreBlocked(client, A, B)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("users_are_blocked", {
      user_a: A,
      user_b: B,
    });
  });

  it("returns false when the rpc reports no block", async () => {
    const { client } = clientWith({ data: false, error: null });

    await expect(usersAreBlocked(client, A, B)).resolves.toBe(false);
  });

  it("short-circuits when both ids are the same user", async () => {
    const { client, rpc } = clientWith({ data: true, error: null });

    await expect(usersAreBlocked(client, A, A)).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the lookup errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = clientWith({ data: null, error: { message: "boom" } });

    await expect(usersAreBlocked(client, A, B)).resolves.toBe(true);
    spy.mockRestore();
  });
});

describe("getBlockedUserIds", () => {
  it("returns the ids from the rpc", async () => {
    const { client } = clientWith({
      data: [{ user_id: A }, { user_id: B }],
      error: null,
    });

    await expect(getBlockedUserIds(client, A)).resolves.toEqual([A, B]);
  });

  it("returns nothing for a logged-out viewer without calling the rpc", async () => {
    const { client, rpc } = clientWith({ data: [{ user_id: A }], error: null });

    await expect(getBlockedUserIds(client, null)).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns nothing when the lookup errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = clientWith({ data: null, error: { message: "boom" } });

    await expect(getBlockedUserIds(client, A)).resolves.toEqual([]);
    spy.mockRestore();
  });
});

describe("notInFilter", () => {
  it("returns null for an empty list so the caller can skip the filter", () => {
    expect(notInFilter([])).toBeNull();
  });

  it("wraps ids in the PostgREST list form", () => {
    expect(notInFilter([A, B])).toBe(`(${A},${B})`);
  });
});
