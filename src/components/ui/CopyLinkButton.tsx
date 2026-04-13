"use client";

import { useState } from "react";
import { Link, Check } from "lucide-react";

interface CopyLinkButtonProps {
  path: string;
  className?: string;
}

export function CopyLinkButton({ path, className = "" }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy shareable link"}
      className={`inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors ${className}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Link className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
