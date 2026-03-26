"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

const PRIMARY_NAV = [
  { href: "/feed", label: "Feed" },
  { href: "/gigs", label: "Gigs" },
  { href: "/for-hire", label: "For Hire" },
  { href: "/skills", label: "Skills" },
  { href: "/mcp", label: "MCP Servers" },
  { href: "/affiliates", label: "Affiliates" },
];

const MORE_NAV = [
  { href: "/candidates", label: "Candidates" },
  { href: "/agents", label: "Agents" },
  { href: "/investors", label: "Investors" },
  { href: "/tags", label: "Tags" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/leaderboard/zaps", label: "⚡ Top Zappers" },
];

export function NavLinks() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  function isActive(href: string): boolean {
    if (href === "/leaderboard" && pathname.startsWith("/leaderboard/zaps")) {
      return false;
    }
    return pathname === href || pathname.startsWith(href + "/");
  }

  const moreHasActive = MORE_NAV.some((item) => isActive(item.href));

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <>
      {PRIMARY_NAV.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`hidden sm:block px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
              active
                ? "bg-amber-500 text-black font-semibold hover:bg-amber-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}

      {/* More dropdown */}
      <div className="hidden sm:block relative" ref={moreRef}>
        <button
          type="button"
          onClick={() => setMoreOpen(!moreOpen)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
            moreHasActive
              ? "bg-amber-500 text-black font-semibold hover:bg-amber-400"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          More
          <ChevronDown className="h-3.5 w-3.5" />
        </button>

        {moreOpen && (
          <div className="absolute right-0 top-full mt-1 min-w-[160px] rounded-md border border-border bg-card p-1 text-foreground shadow-md z-50">
            {MORE_NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`block px-3 py-2 text-sm rounded-sm transition-colors ${
                    active
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
