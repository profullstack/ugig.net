import { vi } from "vitest";

/**
 * A minimal chainable Supabase stand-in for route tests. `tables[name]` holds
 * the rows a select resolves to; inserts and updates are recorded per table.
 */
export function fakeSupabase(tables: Record<string, Record<string, unknown>[]> = {}) {
  const inserts: Record<string, unknown[]> = {};
  const updates: Record<string, Record<string, unknown>[]> = {};

  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    let pendingUpdate: Record<string, unknown> | null = null;
    const b: any = {};
    b.select = vi.fn(() => b);
    b.order = vi.fn(() => b);
    b.limit = vi.fn(() => b);
    b.or = vi.fn(() => b);
    b.eq = vi.fn((col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val);
      return b;
    });
    b.lt = vi.fn((col: string, val: string) => {
      rows = rows.filter((r) => String(r[col]) < val);
      return b;
    });
    b.in = vi.fn((col: string, vals: unknown[]) => {
      rows = rows.filter((r) => vals.includes(r[col]));
      return b;
    });
    b.insert = vi.fn((row: Record<string, unknown>) => {
      (inserts[table] ||= []).push(row);
      const stored = { id: `${table}-new`, ...row };
      (tables[table] ||= []).push(stored);
      rows = [stored];
      return b;
    });
    b.update = vi.fn((patch: Record<string, unknown>) => {
      pendingUpdate = patch;
      return b;
    });
    const result = () => {
      if (pendingUpdate) {
        if (rows.length) (updates[table] ||= []).push(pendingUpdate);
        return { data: rows.map((r) => ({ id: r.id })), error: null };
      }
      return { data: rows, error: null };
    };
    b.single = vi.fn(async () => ({ data: result().data[0] ?? null, error: null }));
    b.maybeSingle = b.single;
    b.then = (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject);
    return b;
  }

  return { client: { from: vi.fn((t: string) => builder(t)) } as any, inserts, updates };
}
