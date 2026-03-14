import { describe, it, expect } from "vitest";
import { generateKeywordOptions } from "@/lib/rule-utils";

describe("generateKeywordOptions", () => {
  it("returns the full merchant name as the most specific option", () => {
    const options = generateKeywordOptions("WHOLE FOODS MARKET #10234");
    expect(options[options.length - 1]).toBe("WHOLE FOODS MARKET #10234");
  });

  it("strips trailing store numbers/codes to produce a cleaned name", () => {
    const options = generateKeywordOptions("WHOLE FOODS MARKET #10234");
    expect(options).toContain("WHOLE FOODS MARKET");
  });

  it("generates progressive word combinations from the left (min 2 words)", () => {
    const options = generateKeywordOptions("WHOLE FOODS MARKET");
    expect(options).toContain("WHOLE FOODS");
    expect(options).toContain("WHOLE FOODS MARKET");
  });

  it("orders options from broadest (shortest) to most specific (longest)", () => {
    const options = generateKeywordOptions("WHOLE FOODS MARKET #10234");
    for (let i = 1; i < options.length; i++) {
      expect(options[i].length).toBeGreaterThanOrEqual(options[i - 1].length);
    }
  });

  it("deduplicates identical entries after cleaning", () => {
    const options = generateKeywordOptions("TARGET");
    const unique = new Set(options);
    expect(options.length).toBe(unique.size);
  });

  it("handles single-word merchant names", () => {
    const options = generateKeywordOptions("Starbucks");
    expect(options).toContain("Starbucks");
    expect(options.length).toBeGreaterThanOrEqual(1);
  });

  it("handles trailing dash-number patterns", () => {
    const options = generateKeywordOptions("COSTCO WHOLESALE -1234");
    expect(options).toContain("COSTCO WHOLESALE");
  });

  it("returns empty array for empty string", () => {
    expect(generateKeywordOptions("")).toEqual([]);
  });

  it("returns empty array for null/undefined", () => {
    expect(generateKeywordOptions(null as unknown as string)).toEqual([]);
    expect(generateKeywordOptions(undefined as unknown as string)).toEqual([]);
  });

  it("handles merchant name with only a store code", () => {
    const options = generateKeywordOptions("#12345");
    expect(options).toEqual([]);
  });

  it("handles merchant name with extra whitespace", () => {
    const options = generateKeywordOptions("  WHOLE  FOODS  MARKET  ");
    expect(options).toContain("WHOLE FOODS MARKET");
    expect(options).toContain("WHOLE FOODS");
  });
});
