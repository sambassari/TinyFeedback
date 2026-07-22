#!/usr/bin/env node
/**
 * TinyFeedback — minimal self-hosted feedback API + static server
 * https://github.com/sambassari/TinyFeedback
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { URL } = require("url");
const { loadProjectEnv } = require("./lib/env");
const { createAuth } = require("./lib/auth");
const { createDomainStore } = require("./lib/domains");
const { createSettingsStore } = require("./lib/settings");
const { createRateLimiter } = require("./lib/rateLimit");

const ROOT = __dirname;
loadProjectEnv(ROOT);

const PORT = Number(process.env.PORT) || 3847;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "feedback.json");
const MAX_BODY = 32 * 1024;
const MAX_MESSAGE = 2000;
const TYPES = new Set(["rating", "comment", "bug", "feature"]);
const PROTECTED_PAGES = new Set(["/dashboard.html", "/dashboard.js"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

function resolveAuthConfig() {
  const isLocal = HOST === "127.0.0.1" || HOST === "localhost" || HOST === "::1";
  let adminPassword = process.env.ADMIN_PASSWORD || "";
  let sessionSecret = process.env.SESSION_SECRET || "";

  if (!adminPassword || !sessionSecret) {
    if (!isLocal) {
      console.error(
        "Missing ADMIN_PASSWORD or SESSION_SECRET.\n" +
          "Copy .env.example to .env and set strong values before binding to a public host."
      );
      process.exit(1);
    }
    if (!adminPassword) adminPassword = "admin";
    if (!sessionSecret) sessionSecret = "dev-only-insecure-secret";
    console.warn(
      "Warning: using local defaults (password: admin). Set ADMIN_PASSWORD and SESSION_SECRET before deploying."
    );
  }

  return { adminPassword, sessionSecret, isLocal };
}

const authConfig = resolveAuthConfig();
const auth = createAuth({
  adminPassword: authConfig.adminPassword,
  sessionSecret: authConfig.sessionSecret,
  dataDir: DATA_DIR,
});
const domains = createDomainStore({ dataDir: DATA_DIR });
const settings = createSettingsStore({
  dataDir: DATA_DIR,
  envPublicUrl: process.env.PUBLIC_URL || "",
});
const feedbackLimiter = createRateLimiter({
  windowMs: Number(process.env.FEEDBACK_RATE_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.FEEDBACK_RATE_MAX) || 30,
});

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, "[]\n", "utf8");
  }
}

function readAll() {
  ensureStore();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8").trim() || "[]";
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAll(items) {
  ensureStore();
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, DB_FILE);
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(payload);
}

function corsPublicFeedback(req, res) {
  const allowed = domains.corsOrigin(req);
  if (allowed) res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  return Boolean(allowed);
}

function corsBearerApi(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
}

function corsFeedbackOptions(req, res) {
  const originHeader = req.headers.origin;
  const reqMethod = String(req.headers["access-control-request-method"] || "").toUpperCase();
  // Public widget POST is domain-gated; session/bearer reads stay open.
  if (reqMethod === "POST" || !reqMethod) {
    const allowed = domains.corsOrigin(req);
    if (allowed) res.setHeader("Access-Control-Allow-Origin", allowed);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Vary", "Origin");
    return Boolean(allowed || !originHeader);
  }
  corsBearerApi(req, res);
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safePath(urlPath) {
  const cleaned = decodeURIComponent(urlPath.split("?")[0]);
  const rel = cleaned === "/" ? "/demo.html" : cleaned;
  const full = path.normalize(path.join(PUBLIC, rel));
  if (!full.startsWith(PUBLIC)) return null;
  return full;
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(items) {
  const header = [
    "id",
    "type",
    "rating",
    "message",
    "pageUrl",
    "userAgent",
    "language",
    "viewport",
    "createdAt",
  ];
  const rows = items.map((item) =>
    [
      item.id,
      item.type,
      item.rating ?? "",
      item.message ?? "",
      item.pageUrl ?? "",
      item.userAgent ?? "",
      item.language ?? "",
      item.viewport ?? "",
      item.createdAt,
    ]
      .map(csvEscape)
      .join(",")
  );
  return [header.join(","), ...rows].join("\n") + "\n";
}

function sanitizeFeedback(input, req) {
  if (!input || typeof input !== "object") {
    throw Object.assign(new Error("Invalid JSON body"), { status: 400 });
  }

  const type = String(input.type || "").toLowerCase();
  if (!TYPES.has(type)) {
    throw Object.assign(new Error("type must be rating, comment, bug, or feature"), {
      status: 400,
    });
  }

  let rating = null;
  if (type === "rating") {
    if (input.rating !== "up" && input.rating !== "down") {
      throw Object.assign(new Error('rating must be "up" or "down"'), { status: 400 });
    }
    rating = input.rating;
  }

  let message = String(input.message || "").trim();
  if (message.length > MAX_MESSAGE) {
    throw Object.assign(new Error(`message max length is ${MAX_MESSAGE}`), { status: 400 });
  }
  if ((type === "comment" || type === "bug" || type === "feature") && !message) {
    throw Object.assign(new Error("message is required"), { status: 400 });
  }

  const pageUrl = String(input.pageUrl || req.headers.referer || "").slice(0, 2048);
  const userAgent = String(input.userAgent || req.headers["user-agent"] || "").slice(0, 512);
  const language = String(input.language || "").slice(0, 32);
  const viewport = String(input.viewport || "").slice(0, 64);

  return {
    id: randomUUID(),
    type,
    rating,
    message,
    pageUrl,
    userAgent,
    language,
    viewport,
    createdAt: new Date().toISOString(),
  };
}

function requireAuth(req, res) {
  if (auth.isAuthenticated(req)) return true;
  send(res, 401, { error: "Unauthorized" });
  return false;
}

function requireSession(req, res) {
  if (auth.isSessionAuthenticated(req)) return true;
  send(res, 401, { error: "Unauthorized" });
  return false;
}

function redirect(res, location) {
  res.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
  });
  res.end();
}

async function handleApi(req, res, url) {
  if (
    (url.pathname === "/api/feedback" ||
      url.pathname === "/api/export.csv" ||
      /^\/api\/feedback\/[^/]+$/.test(url.pathname)) &&
    req.method === "OPTIONS"
  ) {
    if (url.pathname === "/api/feedback") {
      const ok = corsFeedbackOptions(req, res);
      res.writeHead(ok ? 204 : 403);
      res.end();
      return;
    }
    corsBearerApi(req, res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/api/health" && req.method === "GET") {
    send(res, 200, { ok: true, name: "tinyfeedback" });
    return;
  }

  if (url.pathname === "/api/config" && req.method === "GET") {
    const publicUrl = settings.resolveBaseUrl(req);
    send(res, 200, { publicUrl });
    return;
  }

  if (url.pathname === "/api/settings" && req.method === "GET") {
    if (!requireSession(req, res)) return;
    send(res, 200, {
      ...settings.get(),
      effectivePublicUrl: settings.resolveBaseUrl(req),
    });
    return;
  }

  if (url.pathname === "/api/settings" && req.method === "POST") {
    if (!requireSession(req, res)) return;
    try {
      const raw = await readBody(req);
      const input = raw ? JSON.parse(raw) : {};
      const next = settings.setPublicUrl(input.publicUrl);
      send(res, 200, {
        ok: true,
        ...next,
        effectivePublicUrl: next.publicUrl || settings.resolveBaseUrl(req),
      });
    } catch (err) {
      const status = err.status || (err instanceof SyntaxError ? 400 : 500);
      send(res, status, { error: err.message || "Could not save settings" });
    }
    return;
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    const ip = auth.clientIp(req);
    if (auth.isRateLimited(ip)) {
      send(res, 429, { error: "Too many login attempts. Try again later." });
      return;
    }
    try {
      const raw = await readBody(req);
      const input = raw ? JSON.parse(raw) : {};
      const password = String(input.password || "");
      if (!auth.verifyPassword(password)) {
        auth.recordLoginFailure(ip);
        send(res, 401, { error: "Invalid password" });
        return;
      }
      auth.clearLoginFailures(ip);
      const token = auth.createSessionToken();
      send(res, 200, { ok: true }, {
        "Set-Cookie": auth.sessionCookieHeader(token, req),
      });
    } catch (err) {
      const status = err.status || (err instanceof SyntaxError ? 400 : 500);
      send(res, status, { error: err.message || "Login failed" });
    }
    return;
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    send(res, 200, { ok: true }, {
      "Set-Cookie": auth.sessionCookieHeader("", req, { clear: true }),
    });
    return;
  }

  if (url.pathname === "/api/auth/me" && req.method === "GET") {
    if (!auth.isSessionAuthenticated(req)) {
      send(res, 401, { error: "Unauthorized" });
      return;
    }
    send(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/auth/password" && req.method === "POST") {
    if (!requireSession(req, res)) return;
    try {
      const raw = await readBody(req);
      const input = raw ? JSON.parse(raw) : {};
      auth.changePassword(input.currentPassword, input.newPassword);
      send(res, 200, { ok: true });
    } catch (err) {
      const status = err.status || (err instanceof SyntaxError ? 400 : 500);
      send(res, status, { error: err.message || "Could not change password" });
    }
    return;
  }

  if (url.pathname === "/api/domains" && req.method === "GET") {
    if (!requireSession(req, res)) return;
    send(res, 200, domains.list());
    return;
  }

  if (url.pathname === "/api/domains" && req.method === "POST") {
    if (!requireSession(req, res)) return;
    try {
      const raw = await readBody(req);
      const input = raw ? JSON.parse(raw) : {};
      if (Object.prototype.hasOwnProperty.call(input, "autoAdd") && input.domain == null) {
        send(res, 200, { ok: true, ...domains.setAutoAdd(input.autoAdd) });
        return;
      }
      const created = domains.add(input.domain);
      send(res, 201, { ok: true, ...created });
    } catch (err) {
      const status = err.status || (err instanceof SyntaxError ? 400 : 500);
      send(res, status, { error: err.message || "Could not update domains" });
    }
    return;
  }

  const domainDelete = url.pathname.match(/^\/api\/domains\/(.+)$/);
  if (domainDelete && req.method === "DELETE") {
    if (!requireSession(req, res)) return;
    try {
      const state = domains.remove(decodeURIComponent(domainDelete[1]));
      send(res, 200, { ok: true, ...state });
    } catch (err) {
      send(res, err.status || 500, { error: err.message || "Could not remove domain" });
    }
    return;
  }

  if (url.pathname === "/api/tokens" && req.method === "GET") {
    if (!requireSession(req, res)) return;
    send(res, 200, { tokens: auth.listTokens() });
    return;
  }

  if (url.pathname === "/api/tokens" && req.method === "POST") {
    if (!requireSession(req, res)) return;
    try {
      const raw = await readBody(req);
      const input = raw ? JSON.parse(raw) : {};
      const created = auth.createToken(input.name);
      send(res, 201, { ok: true, token: created });
    } catch (err) {
      const status = err.status || (err instanceof SyntaxError ? 400 : 500);
      send(res, status, { error: err.message || "Could not create token" });
    }
    return;
  }

  const tokenDelete = url.pathname.match(/^\/api\/tokens\/([^/]+)$/);
  if (tokenDelete && req.method === "DELETE") {
    if (!requireSession(req, res)) return;
    try {
      auth.revokeToken(decodeURIComponent(tokenDelete[1]));
      send(res, 200, { ok: true });
    } catch (err) {
      send(res, err.status || 500, { error: err.message || "Could not revoke token" });
    }
    return;
  }

  if (url.pathname === "/api/feedback" && req.method === "POST") {
    corsPublicFeedback(req, res);
    const ip = auth.clientIp(req);
    const limit = feedbackLimiter.check(ip);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSec));
      send(res, 429, { error: "Too many feedback submissions. Try again later." });
      return;
    }
    try {
      const raw = await readBody(req);
      const input = raw ? JSON.parse(raw) : {};
      // Honeypot: bots fill hidden fields; respond as success without storing.
      if (String(input._hp || input.website || "").trim()) {
        send(res, 201, { ok: true });
        return;
      }
      const pageUrl = String(input.pageUrl || req.headers.referer || "");
      const gate = domains.authorize(req, pageUrl);
      if (!gate.allowed) {
        send(res, 403, {
          error: "This domain is not allowed. Add it in dashboard Settings.",
        });
        return;
      }
      const item = sanitizeFeedback(input, req);
      const items = readAll();
      items.push(item);
      writeAll(items);
      send(res, 201, { ok: true, item });
    } catch (err) {
      const status = err.status || (err instanceof SyntaxError ? 400 : 500);
      send(res, status, { error: err.message || "Failed to save feedback" });
    }
    return;
  }

  if (url.pathname === "/api/feedback" && req.method === "GET") {
    corsBearerApi(req, res);
    if (!requireAuth(req, res)) return;
    const items = readAll().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const type = url.searchParams.get("type");
    const filtered = type && TYPES.has(type) ? items.filter((i) => i.type === type) : items;
    send(res, 200, { items: filtered, total: filtered.length });
    return;
  }

  const deleteMatch = url.pathname.match(/^\/api\/feedback\/([^/]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    corsBearerApi(req, res);
    if (!requireAuth(req, res)) return;
    const id = decodeURIComponent(deleteMatch[1]);
    const items = readAll();
    const next = items.filter((i) => i.id !== id);
    if (next.length === items.length) {
      send(res, 404, { error: "Not found" });
      return;
    }
    writeAll(next);
    send(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/export.csv" && req.method === "GET") {
    corsBearerApi(req, res);
    if (!requireAuth(req, res)) return;
    const items = readAll().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    send(res, 200, toCsv(items), {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="tinyfeedback.csv"',
    });
    return;
  }

  send(res, 404, { error: "Not found" });
}

function serveStatic(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      send(res, 404, { error: "Not found" });
      return;
    }
    const ext = path.extname(filePath);
    const type = MIME[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": ext === ".js" || ext === ".css" ? "public, max-age=60" : "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

ensureStore();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, { error: "Method not allowed" });
      return;
    }

    if (PROTECTED_PAGES.has(url.pathname) && !auth.isSessionAuthenticated(req)) {
      if (url.pathname.endsWith(".js")) {
        send(res, 401, { error: "Unauthorized" });
        return;
      }
      redirect(res, "/login.html");
      return;
    }

    if (url.pathname === "/login.html" && auth.isSessionAuthenticated(req)) {
      redirect(res, "/dashboard.html");
      return;
    }

    const filePath = safePath(url.pathname);
    if (!filePath) {
      send(res, 400, { error: "Bad path" });
      return;
    }

    serveStatic(req, res, filePath);
  } catch (err) {
    send(res, 500, { error: err.message || "Server error" });
  }
});

server.listen(PORT, HOST, () => {
  const local = `http://${HOST}:${PORT}`;
  const publicUrl = settings.get().publicUrl;
  console.log(`TinyFeedback running at ${local}`);
  if (publicUrl) console.log(`  Public URL: ${publicUrl}`);
  console.log(`  Demo:      ${local}/demo.html`);
  console.log(`  Login:     ${local}/login.html`);
  console.log(`  Dashboard: ${local}/dashboard.html`);
  console.log(`  Widget:    ${local}/tinyfeedback.js`);
});
