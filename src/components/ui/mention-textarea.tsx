"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface UserSuggestion {
  id: string;
  username: string;
  avatar_url: string | null;
}

export interface MentionTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
}

const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(
  ({ value, onChange, className, ...props }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => textareaRef.current!);

    const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [mentionStart, setMentionStart] = useState<number | null>(null);
    const [query, setQuery] = useState("");
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Fetch user suggestions
    const fetchSuggestions = useCallback(async (q: string) => {
      if (q.length < 1) {
        setSuggestions([]);
        setShowDropdown(false);
        return;
      }
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.users || []);
          setShowDropdown((data.users || []).length > 0);
          setSelectedIndex(0);
        }
      } catch {
        setSuggestions([]);
      }
    }, []);

    // Detect @mention context from cursor position
    const detectMention = useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart;
      const textBefore = value.slice(0, cursorPos);

      // Find the last @ before cursor that starts a mention
      const mentionMatch = textBefore.match(/(^|[\s(])@([a-zA-Z0-9_-]*)$/);
      if (mentionMatch) {
        const atIndex = textBefore.lastIndexOf("@");
        const q = mentionMatch[2];
        setMentionStart(atIndex);
        setQuery(q);

        // Compute dropdown position based on textarea
        const rect = textarea.getBoundingClientRect();
        // Approximate: position below the textarea start + some offset
        // For simplicity, show below the textarea
        setDropdownPos({
          top: rect.height + 4,
          left: 0,
        });

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchSuggestions(q), 300);
      } else {
        setShowDropdown(false);
        setMentionStart(null);
        setQuery("");
      }
    }, [value, fetchSuggestions]);

    // Insert selected mention
    const insertMention = useCallback(
      (username: string) => {
        if (mentionStart === null) return;
        const before = value.slice(0, mentionStart);
        const after = value.slice(
          mentionStart + 1 + query.length // +1 for @
        );
        const newValue = `${before}@${username} ${after}`;
        onChange(newValue);
        setShowDropdown(false);
        setMentionStart(null);
        setQuery("");

        // Restore cursor position
        requestAnimationFrame(() => {
          const textarea = textareaRef.current;
          if (textarea) {
            const pos = mentionStart + username.length + 2; // @username + space
            textarea.selectionStart = pos;
            textarea.selectionEnd = pos;
            textarea.focus();
          }
        });
      },
      [value, onChange, mentionStart, query]
    );

    // Handle keyboard navigation in dropdown
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!showDropdown || suggestions.length === 0) return;

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % suggestions.length);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        } else if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          insertMention(suggestions[selectedIndex].username);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setShowDropdown(false);
        }
      },
      [showDropdown, suggestions, selectedIndex, insertMention]
    );

    // Detect mention on input change
    useEffect(() => {
      detectMention();
    }, [value, detectMention]);

    // Close dropdown on outside click
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(e.target as Node) &&
          textareaRef.current &&
          !textareaRef.current.contains(e.target as Node)
        ) {
          setShowDropdown(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Cleanup debounce
    useEffect(() => {
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, []);

    return (
      <div className="relative">
        <textarea
          ref={textareaRef}
          className={cn(
            "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          {...props}
        />

        {showDropdown && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-50 w-72 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            {suggestions.map((user, i) => (
              <button
                key={user.id}
                type="button"
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-sm text-left hover:bg-accent transition-colors",
                  i === selectedIndex && "bg-accent"
                )}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent textarea blur
                  insertMention(user.username);
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                {user.avatar_url ? (
                  <Image
                    src={user.avatar_url}
                    alt={user.username}
                    width={28}
                    height={28}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                    {user.username[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-medium truncate">@{user.username}</div>
                  {user.full_name && (
                    <div className="text-xs text-muted-foreground truncate">
                      {user.full_name}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);

MentionTextarea.displayName = "MentionTextarea";

export { MentionTextarea };
