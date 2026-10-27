import { describe, it, expect, vi } from "vitest";
import { resolveCoinpayLogin } from "./coinpay-login";

type Identity = { id: string; user_id: string; provider: string; provider_user_id: string; email: string };
type User = { id: string; email: string };

/** A tiny in-memory stand-in for the service-role Supabase client. */
function fakeSupabase(users: User[], identities: Identity[]) {
  const createUser = vi.fn(async ({ email }: { email: string }) => {
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { data: { user: null }, error: { code: "email_exists", message: "A user with this email address has already been registered" } };
    }
    const user = { id: `u${users.length + 1}`, email };
    users.push(user);
    return { data: { user }, error: null };
  });
  const client = {
    auth: {
      admin: {
        createUser,
        getUserById: vi.fn(async (id: string) => {
          const user = users.find((u) => u.id === id);
          return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "not found" } };
        }),
        deleteUser: vi.fn(async () => ({ error: null })),
        listUsers: vi.fn(),
        generateLink: vi.fn(),
      },
    },
    from(table: string) {
      expect(table).toBe("oauth_identities");
      const filters: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (k: string, v: string) => {
          filters[k] = v;
          return q;
        },
        maybeSingle: async () => ({
          data: identities.find((i) => Object.entries(filters).every(([k, v]) => (i as any)[k] === v)) ?? null,
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async (row: Omit<Identity, "id">) => {
          identities.push({ id: `i${identities.length + 1}`, ...row });
          return { error: null };
        },
      };
      return q;
    },
  };
  return client;
}

describe("resolveCoinpayLogin", () => {
  it("never opens an existing account whose email matches an unbound CoinPay login", async () => {
    const users = [{ id: "victim", email: "victim@example.com" }];
    const identities: Identity[] = [];
    const sb = fakeSupabase(users, identities);

    const r = await resolveCoinpayLogin(sb, { sub: "attacker-sub", email: "Victim@Example.com", metadata: {} });

    expect(r).toEqual({ kind: "email_in_use" });
    expect(identities).toHaveLength(0);
    expect(sb.auth.admin.listUsers).not.toHaveBeenCalled();
    expect(sb.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it("does not hand a victim's account to a different CoinPay sub with the same email", async () => {
    const users = [{ id: "victim", email: "victim@example.com" }];
    const identities: Identity[] = [
      { id: "i1", user_id: "victim", provider: "coinpay", provider_user_id: "victim-sub", email: "victim@example.com" },
    ];
    const r = await resolveCoinpayLogin(fakeSupabase(users, identities), {
      sub: "attacker-sub",
      email: "victim@example.com",
      metadata: {},
    });
    expect(r.kind).toBe("email_in_use");
  });

  it("signs a bound sub into its own account using that account's email, not the CoinPay email", async () => {
    const users = [
      { id: "alice", email: "alice@example.com" },
      { id: "victim", email: "victim@example.com" },
    ];
    const identities: Identity[] = [
      { id: "i1", user_id: "alice", provider: "coinpay", provider_user_id: "alice-sub", email: "alice@example.com" },
    ];
    // Alice changed her CoinPay email to the victim's address.
    const r = await resolveCoinpayLogin(fakeSupabase(users, identities), {
      sub: "alice-sub",
      email: "victim@example.com",
      metadata: {},
    });
    expect(r).toEqual({ kind: "existing", userId: "alice", email: "alice@example.com" });
  });

  it("creates and binds a new account when the email is unused", async () => {
    const users: User[] = [];
    const identities: Identity[] = [];
    const r = await resolveCoinpayLogin(fakeSupabase(users, identities), {
      sub: "new-sub",
      email: "new@example.com",
      metadata: {},
    });
    expect(r.kind).toBe("created");
    expect(identities).toEqual([
      expect.objectContaining({ user_id: users[0].id, provider: "coinpay", provider_user_id: "new-sub" }),
    ]);
  });
});
