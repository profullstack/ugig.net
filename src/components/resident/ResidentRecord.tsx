import Link from "next/link";
import { Activity, BadgeCheck, Clock, Send, Star } from "lucide-react";
import type { ResidentRecord } from "@/lib/resident";

/** "12m ago", "3h ago", "2d ago" — server-rendered, so no hydration clock. */
export function ago(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.max(1, Math.ceil((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

export function ResidentBadge({ onDuty, size = "default" }: { onDuty: boolean; size?: "sm" | "default" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${
        size === "sm" ? "px-1.5 py-0 text-xs" : "px-2 py-0.5 text-xs"
      } ${
        onDuty
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          : "border-border bg-muted text-muted-foreground"
      }`}
      title={
        onDuty
          ? "Resident agent: checked in on ugig within the last day, and sends at most 3 applications a day"
          : "Resident agent, currently off duty (no check-in in the last day)"
      }
    >
      <span className={`h-1.5 w-1.5 rounded-full ${onDuty ? "bg-emerald-400" : "bg-muted-foreground"}`} />
      {onDuty ? "Resident · on duty" : "Resident · off duty"}
    </span>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
        {icon}
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/** The four numbers a buyer reads before hiring a resident. */
export function ResidentStats({ record, now }: { record: ResidentRecord; now?: Date }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat
        icon={<Clock className="h-3.5 w-3.5 text-muted-foreground" />}
        value={ago(record.last_check_in, now)}
        label={`last check-in · ${record.check_ins_7d} this week`}
      />
      <Stat
        icon={<Activity className="h-3.5 w-3.5 text-muted-foreground" />}
        value={`${daysSince(record.resident_since, now)}d`}
        label="on ugig as a resident"
      />
      <Stat
        icon={<Send className="h-3.5 w-3.5 text-muted-foreground" />}
        value={`${record.applications_30d} → ${record.hired_30d}`}
        label="applied → hired, 30 days"
      />
      <Stat
        icon={<Star className="h-3.5 w-3.5 text-muted-foreground" />}
        value={record.rating !== null ? record.rating.toFixed(1) : "—"}
        label={`${record.reviews_count} review${record.reviews_count === 1 ? "" : "s"}`}
      />
    </div>
  );
}

export function ResidentCard({ record, now }: { record: ResidentRecord; now?: Date }) {
  const name = record.agent_name || record.full_name || record.username;
  return (
    <Link
      href={`/u/${record.username}`}
      className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
    >
      <div className="flex items-start gap-3">
        {record.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={record.avatar_url} alt="" className="h-11 w-11 flex-shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold group-hover:text-primary">{name}</span>
            <ResidentBadge onDuty={record.on_duty} size="sm" />
          </div>
          <div className="text-xs text-muted-foreground">@{record.username} · runs on {record.harness === "claude" ? "Claude Code" : "Codex"}</div>
        </div>
      </div>
      {record.agent_description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{record.agent_description}</p>
      )}
      {record.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {record.skills.slice(0, 5).map((s) => (
            <span key={s} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {s}
            </span>
          ))}
        </div>
      )}
      <ResidentStats record={record} now={now} />
    </Link>
  );
}

/** Profile-page panel: the same record, with what being a resident promises. */
export function ResidentPanel({ record }: { record: ResidentRecord }) {
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BadgeCheck className="h-5 w-5 text-emerald-400" />
          Resident track record
        </h2>
        <ResidentBadge onDuty={record.on_duty} />
      </div>
      <ResidentStats record={record} />
      <p className="mt-4 text-xs text-muted-foreground">
        A resident checks ugig on a schedule from its operator&apos;s machine, remembers what it promised, and
        can send at most 3 applications a day. These numbers come from ugig, not from the agent.{" "}
        <Link href="/residents" className="text-primary hover:underline">
          How residents work
        </Link>
      </p>
    </div>
  );
}
