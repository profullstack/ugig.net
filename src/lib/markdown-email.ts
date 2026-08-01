/**
 * Markdown → email rendering.
 *
 * Broadcast emails are authored in Markdown. Parsing is done by `marked`; all
 * we add is a renderer that inlines styles, because email clients strip <style>
 * blocks and know nothing about Tailwind — the site's `prose` classes are no
 * use here. The plaintext alternative comes from `html-to-text`.
 *
 * The same functions back the admin preview pane and the actual send, so what
 * the preview shows is what subscribers receive.
 */

import { Marked, type RendererObject, type Tokens } from "marked";

const ALLOWED_SCHEMES = /^(https?:|mailto:|#|\/)/i;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Drop anything that isn't a plain http(s)/mailto/relative target. */
function safeUrl(url: string | null | undefined): string | null {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return null;
  return ALLOWED_SCHEMES.test(trimmed) ? trimmed : null;
}

const STYLE = {
  p: "margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #333;",
  h1: "margin: 24px 0 12px; font-size: 24px; line-height: 1.3; color: #111827; font-weight: 600;",
  h2: "margin: 22px 0 10px; font-size: 20px; line-height: 1.3; color: #111827; font-weight: 600;",
  h3: "margin: 20px 0 8px; font-size: 17px; line-height: 1.4; color: #111827; font-weight: 600;",
  h4: "margin: 18px 0 8px; font-size: 15px; line-height: 1.4; color: #111827; font-weight: 600;",
  a: "color: #667eea; text-decoration: underline;",
  list: "margin: 0 0 16px; padding-left: 22px; font-size: 15px; line-height: 1.6; color: #333;",
  li: "margin-bottom: 6px;",
  blockquote:
    "margin: 0 0 16px; padding: 4px 0 4px 14px; border-left: 3px solid #e5e7eb; color: #6b7280; font-size: 15px; line-height: 1.6;",
  pre: "margin: 0 0 16px; padding: 12px 14px; background: #f3f4f6; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.5; color: #111827; white-space: pre-wrap; word-break: break-word;",
  code: "padding: 2px 5px; background: #f3f4f6; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: #111827;",
  hr: "border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;",
  img: "max-width: 100%; height: auto; border-radius: 6px;",
  table:
    "border-collapse: collapse; width: 100%; margin: 0 0 16px; font-size: 14px; color: #333;",
  th: "border: 1px solid #e5e7eb; padding: 8px 10px; background: #f3f4f6; font-weight: 600;",
  td: "border: 1px solid #e5e7eb; padding: 8px 10px;",
} as const;

function alignStyle(align: Tokens.TableCell["align"]): string {
  return ` text-align: ${align ?? "left"};`;
}

/**
 * Renderer overrides. Beyond inlining styles these close two gaps in marked's
 * defaults that matter for email: raw HTML is escaped rather than passed
 * through, and link/image targets are restricted to safe schemes.
 */
const emailRenderer: RendererObject = {
  heading({ tokens, depth }) {
    const level = Math.min(depth, 4) as 1 | 2 | 3 | 4;
    const tag = `h${level}` as const;
    return `<${tag} style="${STYLE[tag]}">${this.parser.parseInline(tokens)}</${tag}>\n`;
  },

  paragraph({ tokens }) {
    return `<p style="${STYLE.p}">${this.parser.parseInline(tokens)}</p>\n`;
  },

  list(token) {
    const tag = token.ordered ? "ol" : "ul";
    const start =
      token.ordered && token.start !== 1 && token.start !== ""
        ? ` start="${token.start}"`
        : "";
    const items = token.items
      .map((item) => `<li style="${STYLE.li}">${this.parser.parse(item.tokens)}</li>`)
      .join("");
    return `<${tag}${start} style="${STYLE.list}">${items}</${tag}>\n`;
  },

  blockquote({ tokens }) {
    // The blockquote supplies the outer spacing; tighten the paragraphs inside
    // it so a quote doesn't end with a doubled gap.
    const inner = this.parser
      .parse(tokens)
      .trim()
      .replace(/margin: 0 0 16px;/g, "margin: 0 0 8px;");
    const last = inner.lastIndexOf("margin: 0 0 8px;");
    const body =
      last === -1
        ? inner
        : `${inner.slice(0, last)}margin: 0;${inner.slice(last + "margin: 0 0 8px;".length)}`;
    return `<blockquote style="${STYLE.blockquote}">${body}</blockquote>\n`;
  },

  code({ text, escaped }) {
    const body = escaped ? text : escapeHtml(text);
    return `<pre style="${STYLE.pre}">${body}</pre>\n`;
  },

  codespan({ text }) {
    return `<code style="${STYLE.code}">${escapeHtml(text)}</code>`;
  },

  hr() {
    return `<hr style="${STYLE.hr}" />\n`;
  },

  link({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const url = safeUrl(href);
    if (!url) return text;
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${escapeHtml(url)}"${titleAttr} style="${STYLE.a}">${text}</a>`;
  },

  image({ href, title, text }) {
    const url = safeUrl(href);
    if (!url) return escapeHtml(text ?? "");
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(text ?? "")}"${titleAttr} style="${STYLE.img}" />`;
  },

  table(token) {
    const head = token.header
      .map(
        (cell) =>
          `<th style="${STYLE.th}${alignStyle(cell.align)}">${this.parser.parseInline(cell.tokens)}</th>`,
      )
      .join("");
    const body = token.rows
      .map(
        (row) =>
          `<tr>${row
            .map(
              (cell) =>
                `<td style="${STYLE.td}${alignStyle(cell.align)}">${this.parser.parseInline(cell.tokens)}</td>`,
            )
            .join("")}</tr>`,
      )
      .join("");
    return `<table style="${STYLE.table}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>\n`;
  },

  // Authored HTML is never trusted into an email — show it as literal text.
  html({ text }) {
    return escapeHtml(text);
  },
};

const marked = new Marked({ gfm: true, breaks: true });
marked.use({ renderer: emailRenderer });

/**
 * Convert Markdown to email-safe HTML (a body fragment, all styles inline).
 */
export function markdownToEmailHtml(markdown: string): string {
  const source = (markdown ?? "").trim();
  if (!source) return "";

  const html = (marked.parse(source, { async: false }) as string).trim();

  // Drop the first block's top margin so the body sits flush under the header.
  return html.replace(/margin:\s*([^;"]+)/, (_m, value: string) => {
    const parts = value.trim().split(/\s+/);
    parts[0] = "0";
    return `margin: ${parts.join(" ")}`;
  });
}

/**
 * Renderer overrides for the text/plain alternative. marked still does all the
 * parsing; these only decide how each token is written out as flat text.
 */
const plainTextRenderer: RendererObject = {
  heading({ tokens }) {
    return `${this.parser.parseInline(tokens)}\n\n`;
  },

  paragraph({ tokens }) {
    return `${this.parser.parseInline(tokens)}\n\n`;
  },

  list(token) {
    const start = Number(token.start) || 1;
    const items = token.items
      .map((item, index) => {
        const marker = token.ordered ? `${start + index}.` : "-";
        const body = this.parser.parse(item.tokens).trim();
        // Indent wrapped lines under the marker.
        return `${marker} ${body.split("\n").join(`\n${" ".repeat(marker.length + 1)}`)}`;
      })
      .join("\n");
    return `${items}\n\n`;
  },

  blockquote({ tokens }) {
    const body = this.parser.parse(tokens).trim();
    return `${body
      .split("\n")
      .map((line) => `> ${line}`.trimEnd())
      .join("\n")}\n\n`;
  },

  code({ text }) {
    return `${text}\n\n`;
  },

  codespan({ text }) {
    return text;
  },

  hr() {
    return "----------\n\n";
  },

  link({ href, tokens }) {
    const text = this.parser.parseInline(tokens);
    const url = safeUrl(href);
    if (!url || url === text) return text;
    return `${text} (${url})`;
  },

  image({ text }) {
    return text ? `[image: ${text}]` : "[image]";
  },

  table(token) {
    const row = (cells: Tokens.TableCell[]) =>
      cells.map((cell) => this.parser.parseInline(cell.tokens)).join(" | ");
    return `${[row(token.header), ...token.rows.map(row)].join("\n")}\n\n`;
  },

  strong({ tokens }) {
    return this.parser.parseInline(tokens);
  },

  em({ tokens }) {
    return this.parser.parseInline(tokens);
  },

  del({ tokens }) {
    return this.parser.parseInline(tokens);
  },

  br() {
    return "\n";
  },

  html() {
    return "";
  },

  // The default escapes entities for HTML output; plaintext wants them literal.
  text(token) {
    const nested = (token as Tokens.Text).tokens;
    return nested ? this.parser.parseInline(nested) : token.text;
  },
};

const markedText = new Marked({ gfm: true, breaks: true });
markedText.use({ renderer: plainTextRenderer });

/**
 * Convert Markdown to a readable plaintext alternative for the text/plain part.
 */
export function markdownToPlainText(markdown: string): string {
  const source = (markdown ?? "").trim();
  if (!source) return "";

  return (markedText.parse(source, { async: false }) as string)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Wrap rendered body HTML in the ugig email chrome (matches src/lib/email.ts).
 */
export function renderBroadcastHtml(params: {
  subject: string;
  markdown: string;
  baseUrl: string;
}): string {
  const { subject, markdown, baseUrl } = params;
  const body = markdownToEmailHtml(markdown);
  const safeSubject = escapeHtml(subject);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeSubject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${safeSubject}</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
${body}
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
    <p style="margin: 5px 0 0 0;">
      <a href="${baseUrl}/dashboard/notifications" style="color: #9ca3af;">Manage notification settings</a>
    </p>
  </div>
</body>
</html>`;
}

/** Plaintext counterpart of {@link renderBroadcastHtml}. */
export function renderBroadcastText(params: {
  subject: string;
  markdown: string;
  baseUrl: string;
}): string {
  const { subject, markdown, baseUrl } = params;
  return `${subject}

${markdownToPlainText(markdown)}

----------
ugig.net - AI-Powered Gig Marketplace
Manage notification settings: ${baseUrl}/dashboard/notifications`;
}
