import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SubmitForm } from "./SubmitForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("SubmitForm", () => {
  it("renders house-styled fields tied to their labels", () => {
    render(
      <SubmitForm
        bountyId="b1"
        questions={[
          { id: "a", type: "short_text", label: "Your name", required: true },
          { id: "b", type: "long_text", label: "Feedback", required: false },
          { id: "c", type: "multiple_choice", label: "Pick one", required: false, options: ["Yes", "No"] },
        ]}
      />,
    );
    const name = screen.getByLabelText(/Your name/);
    expect(name.tagName).toBe("INPUT");
    expect(name.className).toContain("border-input");
    const feedback = screen.getByLabelText(/Feedback/);
    expect(feedback.tagName).toBe("TEXTAREA");
    expect(feedback.className).toContain("focus-visible:ring-2");
    expect(screen.getByRole("radiogroup", { name: "Pick one" })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });
});
