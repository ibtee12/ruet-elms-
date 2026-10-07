import { describe, it, expect, beforeEach } from "vitest";
import { passwordResetRateLimiter, uploadRateLimiter } from "@/lib/rate-limiter";
import { sanitizeCsvCell } from "@/services/audit-logs";
import { sanitizeHtml } from "@/lib/sanitize";
import nextConfig from "@/next.config";

describe("Security Review Fixes", () => {
  describe("Rate Limiters", () => {
    beforeEach(() => {
      passwordResetRateLimiter.clear();
      uploadRateLimiter.clear();
    });

    it("enforces password reset rate limiting after max attempts reached", async () => {
      const key = "reset:127.0.0.1:victim@ruet.ac.bd";
      for (let i = 0; i < 4; i++) {
        const res = await passwordResetRateLimiter.consume(key);
        expect(res.allowed).toBe(true);
      }
      const fifth = await passwordResetRateLimiter.consume(key);
      expect(fifth.allowed).toBe(false);

      const blocked = await passwordResetRateLimiter.check(key);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("enforces upload rate limiting after max attempts reached", async () => {
      const userKey = "user_spammer_123";
      for (let i = 0; i < 14; i++) {
        const res = await uploadRateLimiter.consume(userKey);
        expect(res.allowed).toBe(true);
      }
      const fifteenth = await uploadRateLimiter.consume(userKey);
      expect(fifteenth.allowed).toBe(false);

      const blocked = await uploadRateLimiter.check(userKey);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe("CSV Formula Injection Sanitization", () => {
    it("neutralizes formula trigger characters with leading single quote", () => {
      expect(sanitizeCsvCell("=1+1")).toBe(`"'=1+1"`);
      expect(sanitizeCsvCell("+cmd|' /C calc'!A0")).toBe(`"'+cmd|' /C calc'!A0"`);
      expect(sanitizeCsvCell("-5*5")).toBe(`"'-5*5"`);
      expect(sanitizeCsvCell("@SUM(A1:A10)")).toBe(`"'@SUM(A1:A10)"`);
      expect(sanitizeCsvCell("\tmalicious")).toBe(`"'\tmalicious"`);
      expect(sanitizeCsvCell("\rmalicious")).toBe(`"'\rmalicious"`);
    });

    it("preserves safe non-formula values", () => {
      expect(sanitizeCsvCell("Normal Student Name")).toBe(`"Normal Student Name"`);
      expect(sanitizeCsvCell(2203001)).toBe(`"2203001"`);
    });
  });

  describe("HTML Sanitization against XSS", () => {
    it("strips executable script tags and event handlers", () => {
      const dirty = '<script>alert(1)</script><img src=x onerror="alert(2)" /><a href="javascript:alert(3)">Click</a>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain("<script>");
      expect(clean).not.toContain("onerror");
      expect(clean).not.toContain("javascript:");
    });
  });

  describe("HTTP Security Headers", () => {
    it("defines CSP, X-Frame-Options, HSTS, and X-Content-Type-Options in nextConfig", async () => {
      expect(nextConfig.headers).toBeDefined();
      const headersConfig = await nextConfig.headers!();
      expect(headersConfig.length).toBeGreaterThan(0);
      const rootRule = headersConfig.find((h) => h.source === "/(.*)");
      expect(rootRule).toBeDefined();

      const headerMap = Object.fromEntries(
        rootRule!.headers.map((h) => [h.key, h.value])
      );

      expect(headerMap["X-Content-Type-Options"]).toBe("nosniff");
      expect(headerMap["X-Frame-Options"]).toBe("DENY");
      expect(headerMap["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
      expect(headerMap["Strict-Transport-Security"]).toContain("max-age=63072000");
      expect(headerMap["Content-Security-Policy"]).toContain("default-src 'self'");
      expect(headerMap["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    });
  });
});
