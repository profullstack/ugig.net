"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Smile } from "lucide-react";

const EMOJI_CATEGORIES = {
  "😀 Smileys": ["😀","😂","🤣","😊","😍","🥰","😘","😜","🤔","😏","😎","🥳","😤","😭","😱","🤯","🥺","😴","🤮","💀"],
  "👍 Hands": ["👍","👎","👋","🤝","👏","🙌","💪","✌️","🤞","🤙","👊","✊","🫡","🫶","🙏","💅","🖐️","✋","👌","🤌"],
  "❤️ Hearts": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","❤️‍🔥","💕","💖","💗","💝","💘","💯","💢","💥","✨","🔥"],
  "🎉 Objects": ["🎉","🎊","🎯","🏆","⭐","🌟","💡","💰","💸","🚀","⚡","🔑","🛠️","📌","📝","🎵","🎶","📸","💻","🤖"],
  "🍕 Food": ["🍕","🍔","🌮","🍣","🍜","🍩","🍪","🧁","🍺","🍷","☕","🧃","🥤","🍿","🥂","🎂","🍰","🥑","🌶️","🍗"],
  "🌍 Nature": ["🌍","🌈","☀️","🌙","⛈️","❄️","🌊","🏔️","🌺","🌸","🌲","🍀","🐕","🐈","🦊","🐸","🦋","🐝","🐙","🦑"],
};

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export function EmojiPicker({ onSelect, disabled }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(Object.keys(EMOJI_CATEGORIES)[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="flex-shrink-0"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        aria-label="Emoji picker"
      >
        <Smile className="h-4 w-4" />
      </Button>

      {open && (
        <div
          className="absolute bottom-full mb-2 left-0 border border-border rounded-lg shadow-xl z-50 w-[300px]"
          style={{ backgroundColor: "var(--color-card, #141414)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Category tabs */}
          <div className="flex border-b border-border overflow-x-auto p-1.5 gap-1">
            {Object.keys(EMOJI_CATEGORIES).map((cat) => (
              <button
                key={cat}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveCategory(cat);
                }}
                className={`px-2.5 py-1.5 text-base rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                  activeCategory === cat
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {cat.split(" ")[0]}
              </button>
            ))}
          </div>

          {/* Emoji grid */}
          <div className="p-2 grid grid-cols-8 gap-1 max-h-[220px] overflow-y-auto">
            {EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES].map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(emoji);
                  setOpen(false);
                }}
                className="h-9 w-9 flex items-center justify-center text-xl hover:bg-muted rounded-md transition-colors cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
