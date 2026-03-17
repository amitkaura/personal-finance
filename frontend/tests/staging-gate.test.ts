import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("staging-auth utilities", () => {
  let hashPassword: (pw: string) => string;
  let verifyToken: (token: string, password: string) => boolean;

  beforeEach(async () => {
    const mod = await import("@/lib/staging-auth");
    hashPassword = mod.hashPassword;
    verifyToken = mod.verifyToken;
  });

  describe("hashPassword", () => {
    it("returns a 64-char hex string (SHA-256)", () => {
      const hash = hashPassword("test-password");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("is deterministic (same input produces same output)", () => {
      const a = hashPassword("staging-secret");
      const b = hashPassword("staging-secret");
      expect(a).toBe(b);
    });

    it("produces different hashes for different passwords", () => {
      const a = hashPassword("password-a");
      const b = hashPassword("password-b");
      expect(a).not.toBe(b);
    });
  });

  describe("verifyToken", () => {
    it("returns true when token matches the password hash", () => {
      const hash = hashPassword("my-secret");
      expect(verifyToken(hash, "my-secret")).toBe(true);
    });

    it("returns false when token does not match", () => {
      const hash = hashPassword("my-secret");
      expect(verifyToken(hash, "wrong-password")).toBe(false);
    });

    it("returns false for empty token", () => {
      expect(verifyToken("", "my-secret")).toBe(false);
    });

    it("returns false for malformed token (wrong length)", () => {
      expect(verifyToken("abc123", "my-secret")).toBe(false);
    });
  });
});
