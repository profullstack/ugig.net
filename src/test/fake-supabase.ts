/**
 * A small in-memory stand-in for the supabase-js query builder, for tests that
 * replay a sequence of writes (webhooks, crons, counters) and then assert on
 * the resulting rows rather than on mock call order.
 *
 * Supports: select (columns ignored, full rows returned), insert, update,
 * upsert (onConflict + ignoreDuplicates), delete, eq, neq, in, is, lt, lte,
 * gt, gte, order, limit, single, maybeSingle, and awaiting the builder.
 * rpc() calls a handler registered in `rpcs`.
 */

type Row = Record<string, any>;
type Filter = (row: Row) => boolean;

export type FakeSupabase = {
  tables: Record<string, Row[]>;
  rpcs: Record<string, (args: Record<string, any>, db: FakeSupabase) => unknown>;
  /** Tables whose writes should fail, with the error to return. */
  failWrites: Record<string, { message: string; code?: string }>;
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, any>) => Promise<{ data: unknown; error: unknown }>;
};

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
}

function compare(a: any, b: any): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return a < b ? -1 : 1;
}

class Query {
  private filters: Filter[] = [];
  private action: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private returnRows = false;
  private orderBy: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private mode: "many" | "single" | "maybeSingle" = "many";

  constructor(
    private db: FakeSupabase,
    private table: string
  ) {
    if (!db.tables[table]) db.tables[table] = [];
  }

  select(_cols?: string) {
    if (this.action !== "select") this.returnRows = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.action = "insert";
    this.payload = rows;
    return this;
  }
  update(values: Row) {
    this.action = "update";
    this.payload = values;
    return this;
  }
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.action = "upsert";
    this.payload = rows;
    this.upsertOpts = opts;
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }
  eq(col: string, val: any) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: any) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  in(col: string, vals: any[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  is(col: string, val: any) {
    this.filters.push((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val));
    return this;
  }
  not(col: string, op: string, val: any) {
    if (op === "is" && val === null) {
      this.filters.push((r) => r[col] !== null && r[col] !== undefined);
    } else {
      throw new Error(`fake-supabase: unsupported not(${op})`);
    }
    return this;
  }
  lt(col: string, val: any) {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined && compare(r[col], val) < 0);
    return this;
  }
  lte(col: string, val: any) {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined && compare(r[col], val) <= 0);
    return this;
  }
  gt(col: string, val: any) {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined && compare(r[col], val) > 0);
    return this;
  }
  gte(col: string, val: any) {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined && compare(r[col], val) >= 0);
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orderBy = { col, ascending: opts.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this.execute();
  }
  maybeSingle() {
    this.mode = "maybeSingle";
    return this.execute();
  }
  then<T>(resolve: (v: { data: any; error: any }) => T, reject?: (e: unknown) => T) {
    return this.execute().then(resolve, reject);
  }

  private rows(): Row[] {
    return this.db.tables[this.table];
  }

  private matching(): Row[] {
    return this.rows().filter((r) => this.filters.every((f) => f(r)));
  }

  private async execute(): Promise<{ data: any; error: any }> {
    const fail = this.db.failWrites[this.table];
    if (fail && this.action !== "select") return { data: null, error: fail };

    let result: Row[] = [];
    switch (this.action) {
      case "select":
        result = this.matching();
        break;
      case "insert": {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
        result = list.map((r) => ({ id: nextId(), ...r }));
        this.rows().push(...result);
        break;
      }
      case "update": {
        result = this.matching();
        for (const r of result) Object.assign(r, this.payload);
        break;
      }
      case "delete": {
        result = this.matching();
        this.db.tables[this.table] = this.rows().filter((r) => !result.includes(r));
        break;
      }
      case "upsert": {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
        const keys = (this.upsertOpts.onConflict || "id").split(",").map((k) => k.trim());
        for (const r of list) {
          const existing = this.rows().find((row) => keys.every((k) => row[k] === r[k]));
          if (existing) {
            if (!this.upsertOpts.ignoreDuplicates) Object.assign(existing, r);
            result.push(existing);
          } else {
            const created = { id: nextId(), ...r };
            this.rows().push(created);
            result.push(created);
          }
        }
        break;
      }
    }

    if (this.orderBy) {
      const { col, ascending } = this.orderBy;
      result = [...result].sort((a, b) => (ascending ? 1 : -1) * compare(a[col], b[col]));
    }
    if (this.limitN !== null) result = result.slice(0, this.limitN);

    const copy = result.map((r) => ({ ...r }));
    if (this.mode === "single") {
      if (copy.length !== 1) {
        return { data: null, error: { code: "PGRST116", message: `expected 1 row, got ${copy.length}` } };
      }
      return { data: copy[0], error: null };
    }
    if (this.mode === "maybeSingle") {
      if (copy.length > 1) return { data: null, error: { code: "PGRST116", message: "multiple rows" } };
      return { data: copy[0] ?? null, error: null };
    }
    if (this.action !== "select" && !this.returnRows) return { data: null, error: null };
    return { data: copy, error: null };
  }
}

export function createFakeSupabase(tables: Record<string, Row[]> = {}): FakeSupabase {
  const db: FakeSupabase = {
    tables: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.map((r) => ({ ...r }))])),
    rpcs: {},
    failWrites: {},
    from(table: string) {
      return new Query(db, table);
    },
    async rpc(name: string, args: Record<string, any>) {
      const handler = db.rpcs[name];
      if (!handler) return { data: null, error: { message: `rpc ${name} not registered` } };
      return { data: await handler(args, db), error: null };
    },
  };
  return db;
}
