import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryRateLimiter,
  getAuthRateLimitKey,
} from "@/lib/rate-limiter";

describe("Rate Limiter", () => {
  let limiter: InMemoryRateLimiter;

  beforeEach(() => {
    limiter = new InMemoryRateLimiter({
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
    });
  });

  it("normalizes rate limit keys with trimming and lowercasing", () => {
    expect(getAuthRateLimitKey(" 2203001 ", " 192.168.1.1 ")).toBe(
      "2203001:192.168.1.1"
    );
    expect(
      getAuthRateLimitKey("Student@RUET.ac.bd", "127.0.0.1")
    ).toBe("student@ruet.ac.bd:127.0.0.1");
  });

  it("initially allows attempts with 5 remaining", async () => {
    const status = await limiter.check("test-user:127.0.0.1");
    expect(status.allowed).toBe(true);
    expect(status.attempts).toBe(0);
    expect(status.remaining).toBe(5);
    expect(status.retryAfterSeconds).toBe(0);
  });

  it("decrements remaining count on each failure up to 5 attempts", async () => {
    const key = "user1:127.0.0.1";

    for (let i = 1; i <= 4; i++) {
      const res = await limiter.recordFailure(key);
      expect(res.allowed).toBe(true);
      expect(res.attempts).toBe(i);
      expect(res.remaining).toBe(5 - i);
      expect(res.retryAfterSeconds).toBe(0);
    }

    // 5th failure
    const fifth = await limiter.recordFailure(key);
    expect(fifth.allowed).toBe(false);
    expect(fifth.attempts).toBe(5);
    expect(fifth.remaining).toBe(0);
    expect(fifth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("locks out further attempts after 5 failures for the window", async () => {
    const key = "victim:10.0.0.1";

    for (let i = 0; i < 5; i++) {
      await limiter.recordFailure(key);
    }

    // Checking key after 5 failures
    const status = await limiter.check(key);
    expect(status.allowed).toBe(false);
    expect(status.remaining).toBe(0);
    expect(status.retryAfterSeconds).toBeGreaterThan(0);

    // Any subsequent recordFailure is also blocked
    const subsequent = await limiter.recordFailure(key);
    expect(subsequent.allowed).toBe(false);
    expect(subsequent.remaining).toBe(0);
  });

  it("resets immediately on successful authentication", async () => {
    const key = "user:127.0.0.1";

    for (let i = 0; i < 4; i++) {
      await limiter.recordFailure(key);
    }

    let status = await limiter.check(key);
    expect(status.attempts).toBe(4);
    expect(status.remaining).toBe(1);

    await limiter.reset(key);

    status = await limiter.check(key);
    expect(status.allowed).toBe(true);
    expect(status.attempts).toBe(0);
    expect(status.remaining).toBe(5);
  });

  it("isolates rate limits by identifier and IP independently", async () => {
    const key1 = "student1:192.168.1.1";
    const key2 = "student2:192.168.1.1";
    const key3 = "student1:192.168.1.2";

    for (let i = 0; i < 5; i++) {
      await limiter.recordFailure(key1);
    }

    // key1 is locked out
    expect((await limiter.check(key1)).allowed).toBe(false);

    // key2 (different user, same IP) is unaffected
    expect((await limiter.check(key2)).allowed).toBe(true);
    expect((await limiter.check(key2)).remaining).toBe(5);

    // key3 (same user, different IP) is unaffected
    expect((await limiter.check(key3)).allowed).toBe(true);
    expect((await limiter.check(key3)).remaining).toBe(5);
  });

  it("expires lockout after the window duration has passed", async () => {
    const shortLimiter = new InMemoryRateLimiter({
      maxAttempts: 2,
      windowMs: 30, // 30ms window for fast testing
    });

    const key = "quick-test:127.0.0.1";
    await shortLimiter.recordFailure(key);
    await shortLimiter.recordFailure(key);

    expect((await shortLimiter.check(key)).allowed).toBe(false);

    // Wait 40ms for window to expire
    await new Promise((resolve) => setTimeout(resolve, 40));

    const checkAfterExpire = await shortLimiter.check(key);
    expect(checkAfterExpire.allowed).toBe(true);
    expect(checkAfterExpire.remaining).toBe(2);
  });
});
