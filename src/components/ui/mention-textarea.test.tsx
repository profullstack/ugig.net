import { fireEvent, render, screen, act } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MentionTextarea } from "./mention-textarea";

function ControlledMentionTextarea() {
  const [value, setValue] = React.useState("");
  return <MentionTextarea aria-label="comment" value={value} onChange={setValue} />;
}

function deferredResponse(
  users: Array<{ id: string; username: string; avatar_url: string | null }>
) {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  return {
    promise,
    resolve: () =>
      resolve({
        ok: true,
        json: async () => ({ users }),
      } as Response),
  };
}

function deferredHttpError() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  return {
    promise,
    resolve: () => resolve({ ok: false } as Response),
  };
}

describe("MentionTextarea", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("ignores stale mention search responses after a newer query resolves", async () => {
    vi.useFakeTimers();
    const oldQuery = deferredResponse([{ id: "1", username: "alice", avatar_url: null }]);
    const newQuery = deferredResponse([{ id: "2", username: "adliebe", avatar_url: null }]);
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(oldQuery.promise)
      .mockReturnValueOnce(newQuery.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<ControlledMentionTextarea />);
    const textarea = screen.getByLabelText("comment") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "@a" } });
    textarea.setSelectionRange(2, 2);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(textarea, { target: { value: "@ad" } });
    textarea.setSelectionRange(3, 3);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("q=a");
    expect(fetchMock.mock.calls[1][0]).toContain("q=ad");

    await act(async () => {
      newQuery.resolve();
      await newQuery.promise;
    });
    expect(screen.getByText("@adliebe")).toBeInTheDocument();

    await act(async () => {
      oldQuery.resolve();
      await oldQuery.promise;
    });

    expect(screen.getByText("@adliebe")).toBeInTheDocument();
    expect(screen.queryByText("@alice")).not.toBeInTheDocument();
  });

  it("cancels pending mention search when the cursor leaves mention context", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ControlledMentionTextarea />);
    const textarea = screen.getByLabelText("comment") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "@a" } });
    textarea.setSelectionRange(2, 2);
    fireEvent.change(textarea, { target: { value: "@a done" } });
    textarea.setSelectionRange(7, 7);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears stale suggestions when the active mention search returns an HTTP error", async () => {
    vi.useFakeTimers();
    const goodQuery = deferredResponse([{ id: "1", username: "alice", avatar_url: null }]);
    const failedQuery = deferredHttpError();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(goodQuery.promise)
      .mockReturnValueOnce(failedQuery.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<ControlledMentionTextarea />);
    const textarea = screen.getByLabelText("comment") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "@a" } });
    textarea.setSelectionRange(2, 2);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      goodQuery.resolve();
      await goodQuery.promise;
    });
    expect(screen.getByText("@alice")).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "@ad" } });
    textarea.setSelectionRange(3, 3);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      failedQuery.resolve();
      await failedQuery.promise;
    });

    expect(screen.queryByText("@alice")).not.toBeInTheDocument();
  });
});
