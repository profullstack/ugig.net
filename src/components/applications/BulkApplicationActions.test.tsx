import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { BulkApplicationActions, BulkSelectCheckbox, chunkIds } from "./BulkApplicationActions";
import { WithdrawApplicationButton } from "./WithdrawApplicationButton";

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ updated: 1 }) });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

function renderList(ids: string[]) {
  return render(
    <BulkApplicationActions applicationIds={ids}>
      {ids.map((id) => (
        <div key={id}>
          <BulkSelectCheckbox applicationId={id} label={`Applicant ${id}`} />
        </div>
      ))}
    </BulkApplicationActions>
  );
}

function bodies() {
  return mockFetch.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
}

describe("chunkIds", () => {
  it("splits into batches of at most 50", () => {
    const ids = Array.from({ length: 120 }, (_, i) => `id-${i}`);
    expect(chunkIds(ids).map((c) => c.length)).toEqual([50, 50, 20]);
  });
});

describe("BulkApplicationActions", () => {
  it("rejects the selected applications through bulk-status", async () => {
    renderList(["a", "b", "c"]);
    fireEvent.click(screen.getByTestId("select-application-a"));
    fireEvent.click(screen.getByTestId("select-application-c"));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reject/ }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(window.confirm).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/applications/bulk-status",
      expect.objectContaining({ method: "PUT" })
    );
    expect(bodies()).toEqual([{ application_ids: ["a", "c"], status: "rejected" }]);
  });

  it("shortlists without a confirmation prompt", async () => {
    renderList(["a", "b"]);
    fireEvent.click(screen.getByTestId("select-application-b"));
    fireEvent.click(screen.getByRole("button", { name: /Shortlist/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(bodies()).toEqual([{ application_ids: ["b"], status: "shortlisted" }]);
  });

  it("select all covers every application and batches past 50", async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `app-${i}`);
    renderList(ids);
    fireEvent.click(screen.getByLabelText("Select all applications"));
    expect(screen.getByText("60 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(bodies().map((b) => b.application_ids.length)).toEqual([50, 10]);
  });

  it("does nothing when the reject is not confirmed", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    renderList(["a", "b"]);
    fireEvent.click(screen.getByTestId("select-application-a"));
    fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("disables the actions until something is selected", () => {
    renderList(["a", "b"]);
    expect(screen.getByRole("button", { name: /Reject/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Shortlist/ })).toBeDisabled();
  });

  it("shows the API error", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "You can only update applications for your own gigs" }) });
    renderList(["a", "b"]);
    fireEvent.click(screen.getByTestId("select-application-a"));
    fireEvent.click(screen.getByRole("button", { name: /Shortlist/ }));
    expect(await screen.findByText(/your own gigs/)).toBeInTheDocument();
  });

  it("hides the toolbar for a single application", () => {
    renderList(["only"]);
    expect(screen.queryByTestId("bulk-application-actions")).not.toBeInTheDocument();
  });
});

describe("WithdrawApplicationButton", () => {
  it("withdraws via DELETE /api/applications/[id] after confirming", async () => {
    render(<WithdrawApplicationButton applicationId="app-9" gigTitle="Logo" />);
    fireEvent.click(screen.getByTestId("withdraw-application-app-9"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Logo"));
    expect(mockFetch).toHaveBeenCalledWith("/api/applications/app-9", { method: "DELETE" });
  });

  it("does not withdraw when cancelled", () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<WithdrawApplicationButton applicationId="app-9" />);
    fireEvent.click(screen.getByTestId("withdraw-application-app-9"));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows the API error", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Application not found" }) });
    render(<WithdrawApplicationButton applicationId="app-9" />);
    fireEvent.click(screen.getByTestId("withdraw-application-app-9"));
    expect(await screen.findByText("Application not found")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
