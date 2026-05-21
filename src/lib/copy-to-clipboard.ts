/**
 * Copy text to clipboard with fallback for environments where
 * navigator.clipboard is unavailable or blocked.
 *
 * Uses the modern Clipboard API when available, falling back to
 * a hidden textarea + document.execCommand("copy") pattern.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern Clipboard API first
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or other error — fall through to fallback
    }
  }

  // Fallback: hidden textarea + execCommand
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // Position off-screen to avoid visual flash
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}