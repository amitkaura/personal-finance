import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import SandboxBanner from "@/components/sandbox-banner";
import { renderWithProviders } from "./helpers";

describe("SandboxBanner", () => {
  it("renders the test-mode warning text", () => {
    renderWithProviders(<SandboxBanner />);
    expect(screen.getByTestId("sandbox-banner")).toBeInTheDocument();
    expect(
      screen.getByText(/plaid is in test mode/i)
    ).toBeInTheDocument();
  });

  it("mentions demo accounts in the message", () => {
    renderWithProviders(<SandboxBanner />);
    expect(
      screen.getByText(/demo accounts/i)
    ).toBeInTheDocument();
  });
});
