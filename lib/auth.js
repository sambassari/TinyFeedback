"use strict";

const fs = require("fs");
const path = require("path");
const {
  scryptSync,
  timingSafeEqual,
  createHmac,
  createHash,
  randomBytes,
  randomUUID,
} = require("crypto");

const COOKIE_NAME = "tf_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const SCRYPT_KEYLEN = 64;
const MIN_PASSWORD_LEN = 6;

/**
 * @param {{
 *   adminPassword: string,
 *   sessionSecret: string,
 *   dataDir: string,
 * }} config
 */
function createAuth(config) {
  const bootstrapPassword = String(config.adminPassword || "");
  const sessionSecret = String(config.sessionSecret || "");
  const dataDir = config.dataDir;
  if (!sessionSecret) throw new Error("sessionSecret is required");
  if (sessionSecret.length < 16) {
    throw new Error("SESSION_SECRET must be at least 16 characters");
  }
  if (!dataDir) throw new Error("dataDir is required");

  const passwordFile = path.join(dataDir, "admin.json");
  const tokensFile = path.join(dataDir, "tokens.json");
  const loginAttempts = new Map();

  function ensureDataDir() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  }

  function writeJsonAtomic(file, data) {
    ensureDataDir();
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, file);
  }

  function hashPassword(password, saltBuf) {
    return scryptSync(String(password), saltBuf, SCRYPT_KEYLEN);
  }

  function loadPasswordRecord() {
    ensureDataDir();
    if (fs.existsSync(passwordFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(passwordFile, "utf8"));
        if (data && data.salt && data.hash) return data;
      } catch {
        /* fall through */
      }
    }
    if (!bootstrapPassword) {
      throw new Error("ADMIN_PASSWORD is required on first run");
    }
    const salt = randomBytes(16);
    const hash = hashPassword(bootstrapPassword, salt);
    const record = {
      salt: salt.toString("hex"),
      hash: hash.toString("hex"),
      updatedAt: new Date().toISOString(),
    };
    writeJsonAtomic(passwordFile, record);
    return record;
  }

  let passwordRecord = loadPasswordRecord();

  function verifyPassword(password) {
    const salt = Buffer.from(passwordRecord.salt, "hex");
    const expected = Buffer.from(passwordRecord.hash, "hex");
    const attempt = hashPassword(password, salt);
    if (attempt.length !== expected.length) return false;
    return timingSafeEqual(attempt, expected);
  }

  function changePassword(currentPassword, newPassword) {
    if (!verifyPassword(currentPassword)) {
      const err = new Error("Current password is incorrect");
      err.status = 401;
      throw err;
    }
    const next = String(newPassword || "");
    if (next.length < MIN_PASSWORD_LEN) {
      const err = new Error(`New password must be at least ${MIN_PASSWORD_LEN} characters`);
      err.status = 400;
      throw err;
    }
    const salt = randomBytes(16);
    const hash = hashPassword(next, salt);
    passwordRecord = {
      salt: salt.toString("hex"),
      hash: hash.toString("hex"),
      updatedAt: new Date().toISOString(),
    };
    writeJsonAtomic(passwordFile, passwordRecord);
  }

  function readTokens() {
    ensureDataDir();
    if (!fs.existsSync(tokensFile)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(tokensFile, "utf8"));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function writeTokens(tokens) {
    writeJsonAtomic(tokensFile, tokens);
  }

  function hashToken(raw) {
    return createHash("sha256").update(raw).digest("hex");
  }

  function b64url(buf) {
    return Buffer.from(buf)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function fromB64url(str) {
    const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
    return Buffer.from(b64, "base64");
  }

  function listTokens() {
    return readTokens().map((t) => ({
      id: t.id,
      name: t.name,
      prefix: t.prefix,
      createdAt: t.createdAt,
    }));
  }

  function createToken(name) {
    const label = String(name || "API token").trim().slice(0, 64) || "API token";
    const secret = b64url(randomBytes(32));
    const raw = "tf_live_" + secret;
    const prefix = raw.slice(0, 14) + "…";
    const token = {
      id: randomUUID(),
      name: label,
      prefix,
      hash: hashToken(raw),
      createdAt: new Date().toISOString(),
    };
    const tokens = readTokens();
    tokens.unshift(token);
    writeTokens(tokens);
    return {
      id: token.id,
      name: token.name,
      prefix: token.prefix,
      createdAt: token.createdAt,
      token: raw,
    };
  }

  function revokeToken(id) {
    const tokens = readTokens();
    const next = tokens.filter((t) => t.id !== id);
    if (next.length === tokens.length) {
      const err = new Error("Token not found");
      err.status = 404;
      throw err;
    }
    writeTokens(next);
  }

  function verifyApiToken(raw) {
    if (!raw || typeof raw !== "string" || !raw.startsWith("tf_live_")) return false;
    const digest = hashToken(raw);
    const tokens = readTokens();
    for (const t of tokens) {
      try {
        const a = Buffer.from(t.hash, "hex");
        const b = Buffer.from(digest, "hex");
        if (a.length === b.length && timingSafeEqual(a, b)) return true;
      } catch {
        /* continue */
      }
    }
    return false;
  }

  function getBearer(req) {
    const header = req.headers.authorization;
    if (!header || typeof header !== "string") return "";
    const m = header.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : "";
  }

  function clientIp(req) {
    const xf = req.headers["x-forwarded-for"];
    if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
    return req.socket.remoteAddress || "unknown";
  }

  function isRateLimited(ip) {
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
      loginAttempts.set(ip, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
      return false;
    }
    return entry.count >= LOGIN_MAX_ATTEMPTS;
  }

  function recordLoginFailure(ip) {
    const now = Date.now();
    let entry = loginAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
      loginAttempts.set(ip, entry);
    }
    entry.count += 1;
  }

  function clearLoginFailures(ip) {
    loginAttempts.delete(ip);
  }

  function sign(payloadB64) {
    return b64url(createHmac("sha256", sessionSecret).update(payloadB64).digest());
  }

  function createSessionToken() {
    const payload = JSON.stringify({
      v: 1,
      exp: Date.now() + SESSION_TTL_MS,
      n: randomBytes(8).toString("hex"),
    });
    const payloadB64 = b64url(payload);
    return payloadB64 + "." + sign(payloadB64);
  }

  function readSessionToken(token) {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;
    const expected = sign(payloadB64);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const data = JSON.parse(fromB64url(payloadB64).toString("utf8"));
      if (!data || data.v !== 1 || typeof data.exp !== "number") return null;
      if (Date.now() > data.exp) return null;
      return data;
    } catch {
      return null;
    }
  }

  function parseCookies(req) {
    const header = req.headers.cookie;
    if (!header) return {};
    const out = {};
    for (const part of header.split(";")) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
    return out;
  }

  function isSecureRequest(req) {
    if (req.socket && req.socket.encrypted) return true;
    const proto = req.headers["x-forwarded-proto"];
    return typeof proto === "string" && proto.split(",")[0].trim() === "https";
  }

  function sessionCookieHeader(token, req, { clear = false } = {}) {
    const parts = [
      `${COOKIE_NAME}=${clear ? "" : encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
    ];
    if (clear) parts.push("Max-Age=0");
    else parts.push(`Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
    if (isSecureRequest(req)) parts.push("Secure");
    return parts.join("; ");
  }

  function getSession(req) {
    const cookies = parseCookies(req);
    return readSessionToken(cookies[COOKIE_NAME] || "");
  }

  /** Session cookie or valid API bearer token. */
  function isAuthenticated(req) {
    if (getSession(req)) return true;
    return verifyApiToken(getBearer(req));
  }

  /** Session only — for password/token management. */
  function isSessionAuthenticated(req) {
    return Boolean(getSession(req));
  }

  return {
    COOKIE_NAME,
    MIN_PASSWORD_LEN,
    clientIp,
    isRateLimited,
    recordLoginFailure,
    clearLoginFailures,
    verifyPassword,
    changePassword,
    createSessionToken,
    getSession,
    isAuthenticated,
    isSessionAuthenticated,
    sessionCookieHeader,
    listTokens,
    createToken,
    revokeToken,
    verifyApiToken,
    getBearer,
  };
}

module.exports = { createAuth, COOKIE_NAME, SESSION_TTL_MS, MIN_PASSWORD_LEN };
