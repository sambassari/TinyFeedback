"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRateLimiter } = require("../lib/rateLimit");

test("allows up to max hits then denies with retryAfterSec", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
  const key = "203.0.113.50";
  assert.deepEqual(limiter.check(key), { allowed: true, retryAfterSec: 0 });
  assert.equal(limiter.check(key).allowed, true);
  assert.equal(limiter.check(key).allowed, true);
  const denied = limiter.check(key);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterSec >= 1);
});

test("tracks keys independently", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("a").allowed, false);
  assert.equal(limiter.check("b").allowed, true);
});

test("falls back to defaults and clamps window to at least 1s", () => {
  const missing = createRateLimiter({});
  assert.equal(missing.windowMs, 15 * 60 * 1000);
  assert.equal(missing.max, 20);

  const tiny = createRateLimiter({ windowMs: 1, max: 1 });
  assert.equal(tiny.windowMs, 1000);
  assert.equal(tiny.max, 1);
  assert.equal(tiny.check("x").allowed, true);
  assert.equal(tiny.check("x").allowed, false);
});
