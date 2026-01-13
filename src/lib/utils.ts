import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date): string {
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diff = new Date(date).getTime() - Date.now();
  const absDiff = Math.abs(diff);

  const minutes = Math.round(absDiff / (1000 * 60));
  const hours = Math.round(absDiff / (1000 * 60 * 60));
  const days = Math.round(absDiff / (1000 * 60 * 60 * 24));

  if (minutes < 60) {
    return rtf.format(diff < 0 ? -minutes : minutes, "minute");
  }
  if (hours < 24) {
    return rtf.format(diff < 0 ? -hours : hours, "hour");
  }
  return rtf.format(diff < 0 ? -days : days, "day");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-")
    .trim();
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length).trim() + "...";
}
