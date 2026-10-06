export interface RateLimitStatus {
  allowed: boolean;
  attempts: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  maxAttempts?: number;
  windowMs?: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitStatus>;
  recordFailure(key: string): Promise<RateLimitStatus>;
  consume(key: string): Promise<RateLimitStatus>;
  reset(key: string): Promise<void>;
}

interface InFlightRecord {
  attempts: number;
  resetAt: number;
}

/**
 * Standard in-memory rate limiter implementing the RateLimiter interface.
 * Can be swapped for Redis or a DB-backed limiter by implementing RateLimiter.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly store = new Map<string, InFlightRecord>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(options: RateLimiterOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.windowMs = options.windowMs ?? 15 * 60 * 1000; // 15 minutes
  }

  private cleanIfExpired(key: string, now: number): InFlightRecord | undefined {
    const record = this.store.get(key);
    if (!record) return undefined;
    if (now >= record.resetAt) {
      this.store.delete(key);
      return undefined;
    }
    return record;
  }

  async check(key: string): Promise<RateLimitStatus> {
    const now = Date.now();
    const record = this.cleanIfExpired(key, now);

    if (!record) {
      return {
        allowed: true,
        attempts: 0,
        remaining: this.maxAttempts,
        resetAt: new Date(now + this.windowMs),
        retryAfterSeconds: 0,
      };
    }

    const isAllowed = record.attempts < this.maxAttempts;
    const remaining = Math.max(0, this.maxAttempts - record.attempts);
    const retryAfterSeconds = isAllowed
      ? 0
      : Math.max(1, Math.ceil((record.resetAt - now) / 1000));

    return {
      allowed: isAllowed,
      attempts: record.attempts,
      remaining,
      resetAt: new Date(record.resetAt),
      retryAfterSeconds,
    };
  }

  async recordFailure(key: string): Promise<RateLimitStatus> {
    const now = Date.now();
    const existing = this.cleanIfExpired(key, now);

    let attempts = 1;
    let resetAt = now + this.windowMs;

    if (existing) {
      attempts = existing.attempts + 1;
      resetAt = existing.resetAt;
    }

    this.store.set(key, { attempts, resetAt });

    const isAllowed = attempts < this.maxAttempts;
    const remaining = Math.max(0, this.maxAttempts - attempts);
    const retryAfterSeconds = isAllowed
      ? 0
      : Math.max(1, Math.ceil((resetAt - now) / 1000));

    return {
      allowed: isAllowed,
      attempts,
      remaining,
      resetAt: new Date(resetAt),
      retryAfterSeconds,
    };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  async consume(key: string): Promise<RateLimitStatus> {
    return this.recordFailure(key);
  }

  /**
   * Clears all stored records (useful for test isolation)
   */
  clear(): void {
    this.store.clear();
  }
}

/**
 * Builds a normalized rate limit key from an identifier and client IP.
 */
export function getAuthRateLimitKey(identifier: string, ip: string): string {
  const normId = identifier.trim().toLowerCase();
  const normIp = ip.trim();
  return `${normId}:${normIp}`;
}

export const authRateLimiter: RateLimiter = new InMemoryRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

/**
 * Join-by-code limiters. Failed (wrong/invalid) codes count against both:
 * - per student account: 5 failures / 15 min
 * - per client IP: 20 failures / 15 min (catches spraying across many accounts)
 */
export const joinCodeUserRateLimiter: RateLimiter = new InMemoryRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
});

export const joinCodeIpRateLimiter: RateLimiter = new InMemoryRateLimiter({
  maxAttempts: 20,
  windowMs: 15 * 60 * 1000,
});

/**
 * Discussion forum rate limiter: 5 posts per minute per user.
 */
export const discussionRateLimiter: RateLimiter = new InMemoryRateLimiter({
  maxAttempts: 5,
  windowMs: 60 * 1000, // 1 minute
});
