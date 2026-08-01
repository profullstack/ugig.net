import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmailBroadcastForm } from "./EmailBroadcastForm";

function mockFetch(post?: () => unknown) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return {
        ok: true,
        json: async () => post?.() ?? { sent: 3, failed: 0 },
      } as Response;
    }
    return { ok: true, json: async () => ({ count: 3 }) } as Response;
  });
}

describe("EmailBroadcastForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
  });

  it("shows the recipient count", async () => {
    render(<EmailBroadcastForm baseUrl="https://ugig.net" />);
    expect(await screen.findByText(/3 recipients will receive/i)).toBeInTheDocument();
  });

  it("prompts for input before anything is typed", () => {
    render(<EmailBroadcastForm baseUrl="https://ugig.net" />);
    expect(screen.getByText(/start typing to preview/i)).toBeInTheDocument();
  });

  it("renders typed markdown into the preview iframe", async () => {
    const user = userEvent.setup();
    render(<EmailBroadcastForm baseUrl="https://ugig.net" />);

    await user.type(screen.getByLabelText(/body/i), "# Hi");

    const frame = await screen.findByTitle("Email preview");
    await waitFor(() => {
      expect(frame.getAttribute("srcdoc")).toContain("<h1");
    });
    expect(frame.getAttribute("srcdoc")).toContain("Hi");
  });

  it("switches to a plain-text preview with markdown stripped", async () => {
    const user = userEvent.setup();
    const { container } = render(<EmailBroadcastForm baseUrl="https://ugig.net" />);

    await user.type(screen.getByLabelText(/body/i), "**bold**");
    await user.click(screen.getByRole("tab", { name: /plain text/i }));

    expect(screen.queryByTitle("Email preview")).not.toBeInTheDocument();
    const pre = container.querySelector("pre");
    expect(pre?.textContent).toContain("bold");
    expect(pre?.textContent).not.toContain("**bold**");
  });

  it("posts the raw markdown, not rendered html", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmailBroadcastForm baseUrl="https://ugig.net" />);

    await user.type(screen.getByLabelText(/subject/i), "Hello");
    await user.type(screen.getByLabelText(/body/i), "# Hi");
    await user.click(screen.getByRole("button", { name: /send broadcast/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST",
      );
      expect(post).toBeTruthy();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body).toEqual({ subject: "Hello", markdown: "# Hi" });
    });

    expect(await screen.findByText(/sent 3 emails successfully/i)).toBeInTheDocument();
  });
});
