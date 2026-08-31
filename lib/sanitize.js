"use strict";

const { randomUUID } = require("crypto");

const MAX_MESSAGE = 2000;
const MAX_EMAIL = 254;
const MAX_NAME = 80;
const TYPES = new Set(["nps", "rating", "comment", "bug", "feature"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeFeedback(input, req) {
  if (!input || typeof input !== "object") {
    throw Object.assign(new Error("Invalid JSON body"), { status: 400 });
  }

  const type = String(input.type || "").toLowerCase();
  if (!TYPES.has(type)) {
    throw Object.assign(
      new Error("type must be nps, rating, comment, bug, or feature"),
      { status: 400 }
    );
  }

  let rating = null;
  if (type === "rating") {
    if (input.rating !== "up" && input.rating !== "down") {
      throw Object.assign(new Error('rating must be "up" or "down"'), { status: 400 });
    }
    rating = input.rating;
  }

  let score = null;
  if (type === "nps") {
    const n = Number(input.score);
    if (!Number.isInteger(n) || n < 0 || n > 10) {
      throw Object.assign(new Error("score must be an integer from 0 to 10"), { status: 400 });
    }
    score = n;
  }

  let message = String(input.message || "").trim();
  if (message.length > MAX_MESSAGE) {
    throw Object.assign(new Error(`message max length is ${MAX_MESSAGE}`), { status: 400 });
  }
  if ((type === "comment" || type === "bug" || type === "feature") && !message) {
    throw Object.assign(new Error("message is required"), { status: 400 });
  }

  const name = String(input.name || "").trim().slice(0, MAX_NAME);
  let email = String(input.email || "").trim().slice(0, MAX_EMAIL);
  if (email && !EMAIL_RE.test(email)) {
    throw Object.assign(new Error("email looks invalid"), { status: 400 });
  }

  const headers = (req && req.headers) || {};
  const pageUrl = String(input.pageUrl || headers.referer || "").slice(0, 2048);
  const userAgent = String(input.userAgent || headers["user-agent"] || "").slice(0, 512);
  const language = String(input.language || "").slice(0, 32);
  const viewport = String(input.viewport || "").slice(0, 64);

  return {
    id: randomUUID(),
    type,
    rating,
    score,
    message,
    name,
    email,
    pageUrl,
    userAgent,
    language,
    viewport,
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  sanitizeFeedback,
  TYPES,
  MAX_MESSAGE,
  MAX_EMAIL,
  MAX_NAME,
};
