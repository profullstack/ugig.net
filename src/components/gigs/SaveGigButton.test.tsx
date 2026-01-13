import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaveGigButton } from "./SaveGigButton";

describe("SaveGigButton", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockClear();
  });

  it("renders with unsaved state by default", () => {
    render(<SaveGigButton gigId="gig-123" />);
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByTitle("Save gig")).toBeInTheDocument();
  });

  it("renders with saved state when initialSaved is true", () => {
    render(<SaveGigButton gigId="gig-123" initialSaved={true} />);
    expect(screen.getByTitle("Unsave gig")).toBeInTheDocument();
  });

  it("saves gig on click when not saved", async () => {
    const user = userEvent.setup();
    const onSaveChange = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ saved: { id: "saved-123" } }),
    });

    render(
      <SaveGigButton
        gigId="gig-456"
        initialSaved={false}
        onSaveChange={onSaveChange}
      />
    );

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/saved-gigs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gig_id: "gig-456" }),
      });
    });

    await waitFor(() => {
      expect(onSaveChange).toHaveBeenCalledWith(true);
    });
  });

  it("unsaves gig on click when saved", async () => {
    const user = userEvent.setup();
    const onSaveChange = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: "Gig unsaved successfully" }),
    });

    render(
      <SaveGigButton
        gigId="gig-456"
        initialSaved={true}
        onSaveChange={onSaveChange}
      />
    );

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/saved-gigs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gig_id: "gig-456" }),
      });
    });

    await waitFor(() => {
      expect(onSaveChange).toHaveBeenCalledWith(false);
    });
  });

  it("handles API error gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const onSaveChange = vi.fn();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Gig not found" }),
    });

    render(
      <SaveGigButton
        gigId="gig-456"
        initialSaved={false}
        onSaveChange={onSaveChange}
      />
    );

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to toggle save:",
        "Gig not found"
      );
    });

    // onSaveChange should not be called on error
    expect(onSaveChange).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("disables button while loading", async () => {
    let resolvePromise: () => void;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePromise = () =>
            resolve({
              ok: true,
              json: () => Promise.resolve({ saved: { id: "saved-123" } }),
            });
        })
    );

    const user = userEvent.setup();
    render(<SaveGigButton gigId="gig-123" />);

    await user.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toBeDisabled();

    resolvePromise!();

    await waitFor(() => {
      expect(screen.getByRole("button")).not.toBeDisabled();
    });
  });

  it("stops event propagation on click", async () => {
    const user = userEvent.setup();
    const parentClick = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ saved: { id: "saved-123" } }),
    });

    render(
      <div onClick={parentClick}>
        <SaveGigButton gigId="gig-123" />
      </div>
    );

    await user.click(screen.getByRole("button"));

    expect(parentClick).not.toHaveBeenCalled();
  });
});
