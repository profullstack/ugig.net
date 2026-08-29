import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  subtitle: string;
  /** Swatch color for the single series this card plots. */
  colorVar?: string;
  seriesName?: string;
  children: ReactNode;
  /** The WCAG-clean twin: every plotted value, readable without hovering. */
  table: { headers: string[]; rows: string[][] };
}

export function ChartCard({
  title,
  subtitle,
  colorVar,
  seriesName,
  children,
  table,
}: ChartCardProps) {
  return (
    <section className="p-5 bg-card rounded-lg border border-border shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          {colorVar && (
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: `var(${colorVar})` }}
              aria-hidden="true"
            />
          )}
          {title}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>

      {children}

      <details className="mt-3 group">
        <summary className="text-xs text-muted-foreground hover:text-foreground cursor-pointer list-none">
          <span className="group-open:hidden">Show data table</span>
          <span className="hidden group-open:inline">Hide data table</span>
          {seriesName ? ` — ${seriesName}` : ""}
        </summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-muted-foreground border-b border-border">
                {table.headers.map((header, i) => (
                  <th
                    key={header}
                    className={`py-1.5 pr-4 font-medium ${i === 0 ? "" : "text-right"}`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row[0]} className="border-b border-border/50 last:border-0">
                  {row.map((cell, i) => (
                    <td
                      key={`${row[0]}-${i}`}
                      className={`py-1.5 pr-4 ${
                        i === 0 ? "" : "text-right tabular-nums"
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
