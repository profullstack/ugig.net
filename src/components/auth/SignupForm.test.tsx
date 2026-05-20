import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignupForm } from "./SignupForm";
import { auth } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  auth: {
    signup: vi.fn(),
  },
}));

const signupMock = vi.mocked(auth.signup);

const storage = new Map<string, string>();

const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    storage.delete(key);
  }),
  clear: vi.fn(() => {
    storage.clear();
  }),
};

function fillValidSignupForm() {
  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: "newuser" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "newuser@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "Strongpass1" },
  });
}

describe("SignupForm referral handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("localStorage", localStorageMock);
    localStorage.clear();
    signupMock.mockResolvedValue({ data: {}, error: null });
  });

  it("loads a stored referral and submits it with the signup request", async () => {
    localStorage.setItem("ugig_referral_code", "stored-ref");

    render(<SignupForm />);

    expect(await screen.findByText("Referred by")).toBeInTheDocument();
    expect(screen.getByText("stored-ref")).toBeInTheDocument();

    fillValidSignupForm();
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(signupMock).toHaveBeenCalledWith(
        expect.objectContaining({ ref: "stored-ref" })
      );
    });
  });

  it("prefers the referral from the signup URL over a stored referral", async () => {
    localStorage.setItem("ugig_referral_code", "stored-ref");

    render(<SignupForm referralCode="url-ref" />);

    expect(screen.getByText("url-ref")).toBeInTheDocument();

    fillValidSignupForm();
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(signupMock).toHaveBeenCalledWith(
        expect.objectContaining({ ref: "url-ref" })
      );
    });
  });
});
