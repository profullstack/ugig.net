"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Zap, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { SatsAmount } from "@/components/ui/SatsAmount";

interface ZapUser {
  id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
}

interface ZapEntry {
  id: string;
  amount_sats: number;
  fee_sats: number;
  target_type: string;
  target_id: string;
  note: string | null;
  created_at: string;
  user: ZapUser;
}

const targetLabels: Record<string, string> = {
  post: "Post",
  gig: "Gig",
  comment: "Comment",
  profile: "Profile",
};

function targetHref(type: string, id: string): string {
  switch (type) {
    case "post": return `/post/${id}`;
    case "gig": return `/gigs/${id}`;
    case "profile": return `/u/${id}`;
    default: return "#";
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ZapsPage() {
  const [direction, setDirection] = useState<"received" | "sent">("received");
  const [zaps, setZaps] = useState<ZapEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const requestSeq = useRef(0);
  const limit = 25;

  const fetchZaps = useCallback(async (off: number, reset = false) => {
    const seq = ++requestSeq.current;
    if (reset) {
      setOffset(0);
      setZaps([]);
      setTotal(0);
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/zaps/history?direction=${direction}&limit=${limit}&offset=${off}`);
      const data = await res.json();
      if (seq !== requestSeq.current) return;
      if (data.zaps) {
        setZaps((current) => (off === 0 ? data.zaps : [...current, ...data.zaps]));
        setTotal(data.total);
      }
    } catch {
      if (seq === requestSeq.current && off === 0) {
        setZaps([]);
        setTotal(0);
      }
    }
    if (seq === requestSeq.current) setLoading(false);
  }, [direction, limit]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchZaps(0, true);
  }, [fetchZaps]);

  function selectDirection(nextDirection: "received" | "sent") {
    if (nextDirection === direction) return;
    requestSeq.current += 1;
    setLoading(true);
    setOffset(0);
    setZaps([]);
    setTotal(0);
    setDirection(nextDirection);
  }

  function loadMore() {
    const newOffset = offset + limit;
    setLoading(true);
    setOffset(newOffset);
    fetchZaps(newOffset);
  }

  const totalSats = zaps.reduce((sum, z) => sum + z.amount_sats, 0);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <Zap className="h-6 w-6 text-amber-500 fill-amber-500" /> Zaps
      </h1>
      <p className="text-muted-foreground text-sm mb-6">See who&apos;s zapping you and who you&apos;ve zapped.</p>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6">
        <button
          onClick={() => selectDirection("received")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            direction === "received"
              ? "border-amber-500 text-amber-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ArrowDownLeft className="h-4 w-4" /> Received
        </button>
        <button
          onClick={() => selectDirection("sent")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            direction === "sent"
              ? "border-amber-500 text-amber-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ArrowUpRight className="h-4 w-4" /> Sent
        </button>
      </div>

      {/* Summary */}
      {!loading && zaps.length > 0 && (
        <div className="border border-border rounded-lg p-4 mb-6 bg-card flex items-center justify-between">
          <div>
            <span className="text-sm text-muted-foreground">
              {direction === "received" ? "Total received" : "Total sent"}
            </span>
            <p className="text-xl font-bold text-amber-500 flex items-center gap-1">
              <Zap className="h-5 w-5 fill-amber-500" /> <SatsAmount sats={totalSats} />
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            {total} zap{total !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* List */}
      {loading && zaps.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
        </div>
      ) : zaps.length === 0 ? (
        <div className="border border-border rounded-lg p-12 text-center bg-card">
          <Zap className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {direction === "received"
              ? "No zaps received yet. Post great content and they'll come!"
              : "You haven't zapped anyone yet. Find something you like and hit ⚡!"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {zaps.map((zap) => (
            <div key={zap.id} className="border border-border rounded-lg p-4 bg-card hover:border-amber-500/30 transition-colors">
              <div className="flex items-center gap-3">
                <Link href={zap.user.username ? `/u/${zap.user.username}` : "#"}>
                  <Avatar className="h-10 w-10">
                    {zap.user.avatar_url && <AvatarImage src={zap.user.avatar_url} />}
                    <AvatarFallback>{(zap.user.name || zap.user.username || "?")[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={zap.user.username ? `/u/${zap.user.username}` : "#"}
                      className="font-medium text-foreground hover:underline truncate"
                    >
                      {zap.user.name || `@${zap.user.username}` || "Unknown"}
                    </Link>
                    <span className="text-xs text-muted-foreground">{timeAgo(zap.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{direction === "received" ? "zapped you" : "you zapped"}</span>
                    <span className="text-amber-500 font-medium"><SatsAmount sats={zap.amount_sats} /></span>
                    <span>on</span>
                    <Link
                      href={targetHref(zap.target_type, zap.target_id)}
                      className="text-primary hover:underline"
                    >
                      {targetLabels[zap.target_type] || zap.target_type}
                    </Link>
                  </div>
                  {zap.note && (
                    <p className="text-sm text-muted-foreground mt-1 italic">&ldquo;{zap.note}&rdquo;</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-lg font-bold ${direction === "received" ? "text-green-500" : "text-red-400"}`}>
                    <SatsAmount sats={direction === "received" ? zap.amount_sats : -zap.amount_sats} sign showIcon iconClassName="h-4 w-4 text-amber-500 fill-amber-500 inline ml-1" />
                  </span>
                </div>
              </div>
            </div>
          ))}

          {zaps.length < total && (
            <button
              onClick={loadMore}
              disabled={loading}
              className="w-full py-3 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg bg-card"
            >
              {loading ? "Loading..." : `Load more (${total - zaps.length} remaining)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
