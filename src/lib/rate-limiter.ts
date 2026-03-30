/**
 * In-memory rate limiter for API routes.
 * Uses a sliding window counter pattern.
 * Replace with Redis when scaling to multiple servers.
 */

interface RateEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 30,
  windowMs: 60 * 1000, // 1 minute
};

/**
 * Check if a request is within rate limits.
 *
 * @param key - Unique identifier (e.g., userId, ip)
 * @param config - Rate limit configuration
 * @returns Whether the request is allowed
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  // No previous entry or window expired — start fresh
  if (!entry || now > entry.resetAt) {
    store.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }

  // Within window
  if (entry.count < config.maxRequests) {
    entry.count++;
    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  // Rate limit exceeded
  return {
    allowed: false,
    remaining: 0,
    resetAt: entry.resetAt,
  };
}

/**
 * Preset rate-limit configs for different endpoints
 */
export const RATE_LIMITS = {
  /** Chat endpoint: 20 requests per minute */
  chat: { maxRequests: 20, windowMs: 60_000 },
  /** Transcribe endpoint: 10 requests per minute */
  transcribe: { maxRequests: 10, windowMs: 60_000 },
  /** Quiz endpoint: 5 requests per minute */
  quiz: { maxRequests: 5, windowMs: 60_000 },
  /** Auth endpoints: 10 attempts per 15 minutes */
  auth: { maxRequests: 10, windowMs: 15 * 60_000 },
  /** General API: 60 requests per minute */
  general: { maxRequests: 60, windowMs: 60_000 },
} as const;
