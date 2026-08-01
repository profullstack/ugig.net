import { describe, it, expect } from "vitest";
import {
  markdownToEmailHtml,
  markdownToPlainText,
  renderBroadcastHtml,
  renderBroadcastText,
} from "./markdown-email";

describe("markdownToEmailHtml", () => {
  it("wraps paragraphs and keeps single newlines as line breaks", () => {
    const html = markdownToEmailHtml("first line\nsecond line\n\nnew para");
    expect(html).toContain("first line<br>second line");
    expect(html.match(/<p /g)).toHaveLength(2);
  });

  it("renders headings up to h4", () => {
    const html = markdownToEmailHtml("# One\n\n## Two\n\n### Three\n\n##### Five");
    expect(html).toContain("<h1 ");
    expect(html).toContain("<h2 ");
    expect(html).toContain("<h3 ");
    expect(html).toContain("<h4 ");
    expect(html).toContain("Five");
  });

  it("renders bold, italic and strikethrough", () => {
    const html = markdownToEmailHtml("**bold** and *italic* and ~~gone~~");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<del>gone</del>");
  });

  it("renders links with inline styles", () => {
    const html = markdownToEmailHtml("[ugig](https://ugig.net)");
    expect(html).toContain('<a href="https://ugig.net"');
    expect(html).toContain("ugig</a>");
  });

  it("renders unordered and ordered lists", () => {
    const ul = markdownToEmailHtml("- one\n- two");
    expect(ul).toContain("<ul ");
    expect(ul.match(/<li /g)).toHaveLength(2);

    const ol = markdownToEmailHtml("1. one\n2. two");
    expect(ol).toContain("<ol ");
    expect(ol.match(/<li /g)).toHaveLength(2);
  });

  it("renders blockquotes, rules and fenced code", () => {
    expect(markdownToEmailHtml("> quoted")).toContain("<blockquote ");
    expect(markdownToEmailHtml("---")).toContain("<hr ");

    const code = markdownToEmailHtml("```\nconst a = 1 < 2;\n```");
    expect(code).toContain("<pre ");
    expect(code).toContain("const a = 1 &lt; 2;");
  });

  it("renders inline code without interpreting markdown inside it", () => {
    const html = markdownToEmailHtml("use `**not bold**` here");
    expect(html).toContain("<code ");
    expect(html).toContain("**not bold**");
    expect(html).not.toContain("<strong>");
  });

  it("renders GFM tables", () => {
    const html = markdownToEmailHtml("| Plan | Price |\n| --- | --- |\n| Pro | $10 |");
    expect(html).toContain("<table ");
    expect(html).toContain("<th ");
    expect(html).toContain("Plan");
    expect(html).toContain("$10");
  });

  it("escapes raw HTML so authored markup cannot inject tags", () => {
    const html = markdownToEmailHtml('<script>alert("x")</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops javascript: link and image targets", () => {
    const link = markdownToEmailHtml("[click](javascript:alert(1))");
    expect(link).not.toContain("javascript:");
    expect(link).not.toContain("<a ");
    expect(link).toContain("click");

    const img = markdownToEmailHtml("![x](javascript:alert(1))");
    expect(img).not.toContain("<img");
  });

  it("renders images with allowed schemes", () => {
    const html = markdownToEmailHtml("![logo](https://ugig.net/logo.png)");
    expect(html).toContain('<img src="https://ugig.net/logo.png"');
    expect(html).toContain('alt="logo"');
  });

  it("removes the top margin from the first block only", () => {
    const html = markdownToEmailHtml("# Title\n\n## Second");
    expect(html).toContain('style="margin: 0 0 12px;');
    expect(html).toContain('style="margin: 22px 0 10px;');
  });

  it("returns an empty string for empty input", () => {
    expect(markdownToEmailHtml("")).toBe("");
    expect(markdownToEmailHtml("   \n\n  ")).toBe("");
  });
});

describe("markdownToPlainText", () => {
  it("strips emphasis and heading markers", () => {
    const text = markdownToPlainText("# Title\n\n**bold** and *italic*");
    expect(text).toContain("Title");
    expect(text).not.toContain("#");
    expect(text).not.toContain("**");
    expect(text).toContain("bold and italic");
  });

  it("expands links to text plus url", () => {
    expect(markdownToPlainText("[ugig](https://ugig.net)")).toBe(
      "ugig (https://ugig.net)",
    );
  });

  it("keeps list markers readable", () => {
    const text = markdownToPlainText("- one\n- two\n\n1. first");
    expect(text).toContain("- one");
    expect(text).toContain("1. first");
  });

  it("renders a horizontal rule as a divider", () => {
    expect(markdownToPlainText("a\n\n---\n\nb")).toContain("----------");
  });

  it("keeps fenced code contents without the fences", () => {
    const text = markdownToPlainText("```js\nconst a = 1;\n```");
    expect(text).toContain("const a = 1;");
    expect(text).not.toContain("```");
  });

  it("flattens tables into pipe-separated rows without the divider", () => {
    const text = markdownToPlainText("| Plan | Price |\n| --- | --- |\n| Pro | $10 |");
    expect(text).toContain("Plan | Price");
    expect(text).toContain("Pro | $10");
    expect(text).not.toMatch(/---/);
  });

  it("collapses runs of blank lines", () => {
    expect(markdownToPlainText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("describes images by alt text", () => {
    expect(markdownToPlainText("![logo](https://ugig.net/l.png)")).toBe(
      "[image: logo]",
    );
  });
});

describe("renderBroadcastHtml / renderBroadcastText", () => {
  const params = {
    subject: "Big news",
    markdown: "Hello **world**",
    baseUrl: "https://ugig.net",
  };

  it("wraps the body in a full html document with the subject", () => {
    const html = renderBroadcastHtml(params);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<title>Big news</title>");
    expect(html).toContain("Hello <strong>world</strong>");
    expect(html).toContain("https://ugig.net/dashboard/notifications");
  });

  it("escapes the subject in the document chrome", () => {
    const html = renderBroadcastHtml({ ...params, subject: '<img src=x onerror=1>' });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("produces a plaintext part with the subject and footer", () => {
    const text = renderBroadcastText(params);
    expect(text.startsWith("Big news")).toBe(true);
    expect(text).toContain("Hello world");
    expect(text).toContain("Manage notification settings: https://ugig.net/dashboard/notifications");
    expect(text).not.toContain("<");
  });
});
