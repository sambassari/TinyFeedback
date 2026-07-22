"use strict";

/**
 * Simple in-memory sliding window rate limiter.
 * @param {{ windowMs: number, max: number }} opts
 */
function createRateLimiter(opts) {
  const windowMs = Math.max(1000, Number(opts.windowMs) || 15 * 60 * 1000);
  const max = Math.max(1, Number(opts.max) || 20);
  const hits = new Map();

  function prune(now) {
    if (hits.size < 5000) return;
    for (const [key, entry] of hits) {
      if (now > entry.resetAt) hits.delete(key);
    }
  }

  /** @returns {{ allowed: boolean, retryAfterSec: number }} */
  function check(key) {
    const now = Date.now();
    prune(now);
    let entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    if (entry.count >= max) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    }
    entry.count += 1;
    return { allowed: true, retryAfterSec: 0 };
  }

  return { check, windowMs, max };
}

module.exports = { createRateLimiter };
