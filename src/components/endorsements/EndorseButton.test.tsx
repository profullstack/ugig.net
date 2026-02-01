import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EndorseButton } from "./EndorseButton";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EndorseButton", () => {
  it("renders with count when count > 0", () => {
    render(
      <EndorseButton
        username="testuser"
        skill="React"
        isEndorsed={false}
        count={5}
      />
    );
    expect(screen.getByText("5")).toBeDefined();
  });

  it("does not render count when count is 0", () => {
    render(
      <EndorseButton
        username="testuser"
        skill="React"
        isEndorsed={false}
        count={0}
      />
    );
    expect(screen.queryByText("0")).toBeNull();
  });

  it("calls POST when clicking to endorse", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });

    render(
      <EndorseButton
        username="testuser"
        skill="React"
        isEndorsed={false}
        count={3}
      />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/users/testuser/endorse",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ skill: "React" }),
        })
      );
    });
  });

  it("calls DELETE when clicking to un-endorse", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    render(
      <EndorseButton
        username="testuser"
        skill="React"
        isEndorsed={true}
        count={3}
      />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/users/testuser/endorse?skill=React",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <EndorseButton
        username="testuser"
        skill="React"
        isEndorsed={false}
        count={0}
        disabled
      />
    );
    const button = screen.getByRole("button");
    expect(button).toHaveProperty("disabled", true);
  });
});
