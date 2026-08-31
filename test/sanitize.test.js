"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  sanitizeFeedback,
  MAX_MESSAGE,
  MAX_NAME,
} = require("../lib/sanitize");
const { fakeReq } = require("./helpers");

test("accepts nps, rating, and message types", () => {
  const nps = sanitizeFeedback({ type: "nps", score: 9, message: "Great" }, fakeReq());
  assert.equal(nps.type, "nps");
  assert.equal(nps.score, 9);
  assert.equal(nps.rating, null);
  assert.ok(nps.id);
  assert.ok(nps.createdAt);

  const rating = sanitizeFeedback({ type: "rating", rating: "up" }, fakeReq());
  assert.equal(rating.rating, "up");
  assert.equal(rating.score, null);

  const comment = sanitizeFeedback({ type: "comment", message: "  hi  " }, fakeReq());
  assert.equal(comment.message, "hi");

  const bug = sanitizeFeedback({ type: "bug", message: "broken" }, fakeReq());
  assert.equal(bug.type, "bug");

  const feature = sanitizeFeedback({ type: "feature", message: "please" }, fakeReq());
  assert.equal(feature.type, "feature");
});

test("rejects invalid type, score, rating, and missing message", () => {
  assert.throws(() => sanitizeFeedback(null, fakeReq()), (err) => err.status === 400);
  assert.throws(() => sanitizeFeedback({ type: "other" }, fakeReq()), /type must be/);
  assert.throws(() => sanitizeFeedback({ type: "nps", score: 11 }, fakeReq()), /score/);
  assert.throws(() => sanitizeFeedback({ type: "nps", score: 1.5 }, fakeReq()), /score/);
  assert.throws(() => sanitizeFeedback({ type: "rating", rating: "meh" }, fakeReq()), /rating/);
  assert.throws(() => sanitizeFeedback({ type: "comment" }, fakeReq()), /message is required/);
  assert.throws(() => sanitizeFeedback({ type: "bug", message: "   " }, fakeReq()), /message is required/);
});

test("rejects invalid email and trims name/email", () => {
  assert.throws(
    () => sanitizeFeedback({ type: "comment", message: "x", email: "not-an-email" }, fakeReq()),
    /email looks invalid/
  );
  const item = sanitizeFeedback(
    { type: "comment", message: "x", name: "  Ada  ", email: "ada@example.com" },
    fakeReq()
  );
  assert.equal(item.name, "Ada");
  assert.equal(item.email, "ada@example.com");
});

test("truncates long name and falls back to request headers", () => {
  const item = sanitizeFeedback(
    { type: "rating", rating: "down", name: "n".repeat(MAX_NAME + 20) },
    fakeReq({
      headers: {
        referer: "https://example.com/from-header",
        "user-agent": "TestAgent/1.0",
      },
    })
  );
  assert.equal(item.name.length, MAX_NAME);
  assert.equal(item.pageUrl, "https://example.com/from-header");
  assert.equal(item.userAgent, "TestAgent/1.0");
});

test("rejects oversized messages", () => {
  assert.throws(
    () =>
      sanitizeFeedback(
        { type: "comment", message: "m".repeat(MAX_MESSAGE + 1) },
        fakeReq()
      ),
    /message max length/
  );
});

test("optional contact fields default to empty strings", () => {
  const item = sanitizeFeedback({ type: "comment", message: "ok" }, fakeReq());
  assert.equal(item.name, "");
  assert.equal(item.email, "");
});
