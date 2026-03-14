/**
 * Generate keyword options from a merchant name for category rule creation.
 * Returns options ordered from broadest (shortest) to most specific (longest).
 */
export function generateKeywordOptions(merchantName: string): string[] {
  if (!merchantName || typeof merchantName !== "string") return [];

  const trimmed = merchantName.trim();
  if (!trimmed) return [];

  // Strip trailing store numbers/codes: "#1234", "-1234", or standalone digits
  const cleaned = trimmed
    .replace(/\s*[#\-]\s*\d+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return [];

  const words = cleaned.split(" ");
  const options: string[] = [];

  // Progressive word combinations from the left, minimum 2 words
  for (let len = 2; len <= words.length; len++) {
    options.push(words.slice(0, len).join(" "));
  }

  // Single-word case: just include the word itself
  if (words.length === 1) {
    options.push(cleaned);
  }

  // Include the full original (trimmed + normalized whitespace) if different from cleaned
  const normalizedOriginal = trimmed.replace(/\s+/g, " ");
  if (normalizedOriginal !== cleaned) {
    options.push(normalizedOriginal);
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  return options.filter((opt) => {
    if (seen.has(opt)) return false;
    seen.add(opt);
    return true;
  });
}
