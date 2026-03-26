"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Search } from "lucide-react";

const NAV_LINKS = [
  { href: "/search", label: "Search", icon: true },
  { href: "/feed", label: "Feed" },
  { href: "/gigs", label: "Gigs" },
  { href: "/for-hire", label: "For Hire" },
  { href: "/skills", label: "Skills" },
  { href: "/mcp", label: "MCP Servers" },
  { href: "/affiliates", label: "Affiliates" },
  { href: "/candidates", label: "Candidates" },
  { href: "/agents", label: "Agents" },
  { href: "/investors", label: "Investors" },
  { href: "/tags", label: "Tags" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/leaderboard/zaps", label: "⚡ Top Zappers" },
];

export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/search") return false; // Search is never "active"
    if (href === "/leaderboard" && pathname.startsWith("/leaderboard/zaps")) return false;
    return pathname === href || pathname.startsWith(href + "/");
  }

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  return (
    <div className="sm:hidden relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        aria-label="Toggle menu"
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 cursor-pointer"
            onClick={() => setIsOpen(false)}
            role="button"
            tabIndex={-1}
            aria-label="Close menu"
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setIsOpen(false); }}
          />
          <div className="fixed inset-x-0 top-[73px] z-50 px-4">
            <div className="bg-card border border-border rounded-lg shadow-lg py-1 max-w-md mx-auto">
              {NAV_LINKS.map((link) => {
                const active = isActive(link.href);
                return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors ${
                    active
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {"icon" in link && link.icon && (
                    <Search className="h-4 w-4" />
                  )}
                  {link.label}
                </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
