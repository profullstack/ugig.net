import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ReputationBadge } from "../ReputationBadge";

describe("ReputationBadge", () => {
  it("renders nothing when did is null", () => {
    const { container } = render(<ReputationBadge did={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when did is undefined", () => {
    const { container } = render(<ReputationBadge did={undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders badge img when did is provided", () => {
    const { container } = render(
      <ReputationBadge did="did:key:z6Mk123" />
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("did%3Akey%3Az6Mk123");
  });

  it("links to coinpayportal reputation page", () => {
    const { container } = render(
      <ReputationBadge did="did:key:z6Mk123" />
    );
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toContain("coinpayportal.com/reputation?did=");
    expect(link?.getAttribute("target")).toBe("_blank");
  });

  it("respects size prop", () => {
    const { container: sm } = render(
      <ReputationBadge did="did:key:z6Mk123" size="sm" />
    );
    const { container: md } = render(
      <ReputationBadge did="did:key:z6Mk123" size="md" />
    );
    const smImg = sm.querySelector("img");
    const mdImg = md.querySelector("img");
    expect(smImg?.style.height).toBe("16px");
    expect(mdImg?.style.height).toBe("20px");
  });
});
