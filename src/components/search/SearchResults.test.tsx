import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SearchResults } from "./SearchResults";

const navigation = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));

vi.mock("@/components/gigs/GigCard", () => ({
  GigCard: () => <div>Gig result</div>,
}));

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  navigation.searchParams = new URLSearchParams("q=typescript&type=gigs&page=-4");
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      query: "typescript",
      type: "gigs",
      results: {
        gigs: {
          data: [{ id: "gig-1", title: "TypeScript help" }],
          total: 20,
          page: 1,
          limit: 10,
          hasMore: true,
        },
      },
    }),
  });
  globalThis.fetch = mockFetch;
});

describe("SearchResults", () => {
  it("normalizes malformed URL pages before fetching and rendering pagination", async () => {
    render(<SearchResults />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/search?q=typescript&type=gigs&page=1&limit=10"
      );
    });

    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    expect(navigation.replace).toHaveBeenCalledWith(
      "/search?q=typescript&type=gigs"
    );
  });
});
