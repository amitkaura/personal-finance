"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "./api";
import { useHousehold } from "@/components/household-provider";
import type { UserSettings, ViewScope } from "./types";

export function useSettings() {
  return useQuery<UserSettings>({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useFormatCurrency() {
  const { data: settings } = useSettings();
  const currency = settings?.currency ?? "CAD";
  const locale = settings?.locale ?? "en-CA";

  return useCallback(
    (n: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(n),
    [currency, locale]
  );
}

export function useScope(): ViewScope {
  const { scope } = useHousehold();
  return scope;
}

export function useFormatCurrencyPrecise() {
  const { data: settings } = useSettings();
  const currency = settings?.currency ?? "CAD";
  const locale = settings?.locale ?? "en-CA";

  return useCallback(
    (n: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
      }).format(n),
    [currency, locale]
  );
}
