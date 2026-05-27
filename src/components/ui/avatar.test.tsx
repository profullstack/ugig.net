import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AvatarImage } from "./avatar";

describe("AvatarImage", () => {
  it("uses an empty alt attribute by default", () => {
    const { container } = render(<AvatarImage src="/avatar.png" />);

    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("preserves an explicit alt attribute", () => {
    render(<AvatarImage src="/avatar.png" alt="Ada Lovelace" />);

    expect(screen.getByRole("img", { name: "Ada Lovelace" })).toBeInTheDocument();
  });
});
