import { createHash, timingSafeEqual } from "crypto";

const HASH_ALGO = "sha256";

export function hashPassword(password: string): string {
  return createHash(HASH_ALGO).update(password).digest("hex");
}

export function verifyToken(token: string, password: string): boolean {
  if (!token || token.length !== 64) return false;
  const expected = hashPassword(password);
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const COOKIE_NAME = "staging-auth";
export const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
