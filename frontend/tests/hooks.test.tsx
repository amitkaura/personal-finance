import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useFormatCurrency, useFormatCurrencyPrecise, useScope } from "@/lib/hooks";
import { createWrapper, TEST_SETTINGS } from "./helpers";
import type { ViewScope } from "@/lib/types";

const mockApi = vi.hoisted(() => ({
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: mockApi,
}));

const mockHouseholdState = vi.hoisted(() => ({ scope: "personal" as ViewScope }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => mockHouseholdState,
}));

describe("useFormatCurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
  });

  it("formats currency with defaults (CAD, en-CA, no decimals)", async () => {
    const { result } = renderHook(() => useFormatCurrency(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const formatted = result.current(1234);
      expect(formatted).toContain("1,234");
    });
  });

  it("formats with loaded settings", async () => {
    mockApi.getSettings.mockResolvedValue({
      ...TEST_SETTINGS,
      currency: "USD",
      locale: "en-US",
    });

    const { result } = renderHook(() => useFormatCurrency(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const formatted = result.current(5000);
      expect(formatted).toMatch(/\$5,000/);
    });
  });

  it("formats negative amounts", async () => {
    const { result } = renderHook(() => useFormatCurrency(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const formatted = result.current(-500);
      expect(formatted).toContain("500");
    });
  });
});

describe("useFormatCurrencyPrecise", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
  });

  it("formats with 2 decimal places", async () => {
    const { result } = renderHook(() => useFormatCurrencyPrecise(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const formatted = result.current(1234.56);
      expect(formatted).toContain("1,234.56");
    });
  });
});

describe("useScope", () => {
  beforeEach(() => {
    mockHouseholdState.scope = "personal";
  });

  it("returns the current scope from HouseholdProvider", () => {
    const { result } = renderHook(() => useScope(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toBe("personal");
  });

  it("reflects scope changes", () => {
    mockHouseholdState.scope = "household";

    const { result } = renderHook(() => useScope(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toBe("household");
  });
});
