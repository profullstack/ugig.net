import Table from "cli-table3";
import chalk from "chalk";

export interface OutputOptions {
  json: boolean;
}

export interface ColumnDef {
  header: string;
  key: string;
  width?: number;
  transform?: (value: unknown, row: Record<string, unknown>) => string;
}

export interface FieldDef {
  label: string;
  key: string;
  transform?: (value: unknown) => string;
}

export function printTable(
  columns: ColumnDef[],
  rows: Record<string, unknown>[],
  options: OutputOptions,
  pagination?: { page: number; total: number; totalPages?: number; limit?: number }
): void {
  if (options.json) {
    console.log(JSON.stringify(pagination ? { data: rows, pagination } : rows, null, 2));
    return;
  }

  if (rows.length === 0) {
    console.log(chalk.dim("  No results found."));
    return;
  }

  const table = new Table({
    head: columns.map((c) => chalk.bold(c.header)),
    colWidths: columns.map((c) => c.width ?? null),
    style: { head: [], border: ["dim"] },
    wordWrap: true,
  });

  for (const row of rows) {
    table.push(
      columns.map((col) => {
        const value = row[col.key];
        if (col.transform) return col.transform(value, row);
        return value == null ? chalk.dim("-") : String(value);
      })
    );
  }

  console.log(table.toString());

  if (pagination && pagination.totalPages && pagination.totalPages > 1) {
    console.log(
      chalk.dim(
        `\n  Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total) — use --page ${pagination.page + 1} to see more`
      )
    );
  }
}

export function printDetail(
  fields: FieldDef[],
  data: Record<string, unknown>,
  options: OutputOptions
): void {
  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const maxLabel = Math.max(...fields.map((f) => f.label.length));

  for (const field of fields) {
    const value = data[field.key];
    const formatted = field.transform
      ? field.transform(value)
      : value == null
        ? chalk.dim("-")
        : String(value);
    const label = field.label.padEnd(maxLabel + 2);
    console.log(`  ${chalk.bold(label)}${formatted}`);
  }
}

export function printSuccess(message: string, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify({ success: true, message }));
    return;
  }
  console.log(chalk.green("  " + message));
}

export function printError(message: string, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify({ error: message }));
    return;
  }
  console.error(chalk.red("  Error: " + message));
}

// Common transforms
export function truncateId(value: unknown): string {
  const s = String(value || "");
  return s.length > 8 ? s.slice(0, 8) + ".." : s;
}

export function truncate(maxLen: number) {
  return (value: unknown): string => {
    const s = String(value || "");
    return s.length > maxLen ? s.slice(0, maxLen - 2) + ".." : s;
  };
}

export function formatBudget(_: unknown, row: Record<string, unknown>): string {
  const type = row.budget_type as string;
  const min = row.budget_min as number | null;
  const max = row.budget_max as number | null;
  const unit = row.budget_unit as string | null;

  const suffix = (() => {
    switch (type) {
      case "hourly": return "/hr";
      case "per_task": return unit ? `/${unit}` : "/task";
      case "per_unit": return unit ? `/${unit}` : "/unit";
      case "revenue_share": return "% rev";
      default: return "";
    }
  })();

  if (type === "revenue_share") {
    if (min && max) return `${min}-${max}${suffix}`;
    if (min) return `${min}+${suffix}`;
    if (max) return `<${max}${suffix}`;
    return chalk.dim("-");
  }

  if (min && max) return `$${min}-${max}${suffix}`;
  if (min) return `$${min}+${suffix}`;
  if (max) return `<$${max}${suffix}`;
  return chalk.dim("-");
}

export function colorizeStatus(value: unknown): string {
  const s = String(value || "");
  switch (s) {
    case "active":
    case "accepted":
      return chalk.green(s);
    case "paused":
    case "pending":
    case "reviewing":
      return chalk.yellow(s);
    case "closed":
    case "rejected":
    case "withdrawn":
    case "filled":
      return chalk.red(s);
    case "draft":
      return chalk.dim(s);
    case "shortlisted":
      return chalk.blue(s);
    default:
      return s;
  }
}

export function relativeDate(value: unknown): string {
  if (!value) return chalk.dim("-");
  const date = new Date(String(value));
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export function formatDate(value: unknown): string {
  if (!value) return chalk.dim("-");
  return new Date(String(value)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatArray(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ") || chalk.dim("-");
  return chalk.dim("-");
}
