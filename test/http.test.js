"use strict";

/**
 * HTTP tests load server.js once. Set DATA_DIR (and auth env) before require
 * so production's ./data directory is never touched.
 */
const fs = require("fs");
const path = require("path");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { makeTempDir, rmTempDir } = require("./helpers");

const dataDir = makeTempDir();
process.env.DATA_DIR = dataDir;
process.env.ADMIN_PASSWORD = "test-admin-password";
process.env.SESSION_SECRET = "test-session-secret";
process.env.HOST = "127.0.0.1";
process.env.FEEDBACK_RATE_MAX = "100";
delete process.env.PORT;

const { start, server, VERSION } = require("../server");
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

function listen() {
  return new Promise((resolve, reject) => {
    start(0, "127.0.0.1", (err) => {
      if (err) {
        reject(err);
        return;
      }
      const addr = server.address();
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

test("http api", async (t) => {
  const base = await listen();
  try {
    await t.test("GET /api/health reports package.json SemVer", async () => {
      const res = await fetch(base + "/api/health");
      const body = await json(res);
      assert.equal(res.status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.name, "tinyfeedback");
      assert.equal(body.version, pkg.version);
      assert.equal(body.version, VERSION);
      assert.notEqual(body.version, "0.0.0");
    });

    await t.test("GET /api/config includes the same version", async () => {
      const res = await fetch(base + "/api/config");
      const body = await json(res);
      assert.equal(res.status, 200);
      assert.equal(body.version, pkg.version);
    });

    await t.test("POST /api/auth/login rejects a bad password", async () => {
      const res = await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "wrong" }),
      });
      const body = await json(res);
      assert.equal(res.status, 401);
      assert.equal(body.error, "Invalid password");
    });

    let cookie = "";
    await t.test("POST /api/auth/login sets a session cookie", async () => {
      const res = await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "test-admin-password" }),
      });
      const body = await json(res);
      assert.equal(res.status, 200);
      assert.equal(body.ok, true);
      const setCookie = res.headers.get("set-cookie") || "";
      assert.ok(setCookie.includes("tf_session="));
      cookie = setCookie.split(";")[0];
    });

    await t.test("GET /api/auth/me requires the session", async () => {
      const anon = await fetch(base + "/api/auth/me");
      assert.equal(anon.status, 401);
      const ok = await fetch(base + "/api/auth/me", { headers: { Cookie: cookie } });
      assert.equal(ok.status, 200);
    });

    await t.test("POST /api/feedback stores a comment", async () => {
      const res = await fetch(base + "/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://shop.example",
        },
        body: JSON.stringify({
          type: "comment",
          message: "checkout was smooth",
          pageUrl: "https://shop.example/cart",
        }),
      });
      const body = await json(res);
      assert.equal(res.status, 201);
      assert.equal(body.ok, true);
      assert.equal(body.item.message, "checkout was smooth");
      assert.equal(body.item.type, "comment");
    });

    await t.test("POST /api/feedback honeypot is accepted but not stored", async () => {
      const before = await fetch(base + "/api/feedback", { headers: { Cookie: cookie } });
      const beforeBody = await json(before);
      const res = await fetch(base + "/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "comment",
          message: "i am a bot",
          _hp: "http://spam.example",
        }),
      });
      assert.equal(res.status, 201);
      const after = await fetch(base + "/api/feedback", { headers: { Cookie: cookie } });
      const afterBody = await json(after);
      assert.equal(afterBody.total, beforeBody.total);
    });

    await t.test("domain allowlist blocks unknown origins when autoAdd is off", async () => {
      const add = await fetch(base + "/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ domain: "https://allowed.example" }),
      });
      assert.equal(add.status, 201);

      const lock = await fetch(base + "/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ autoAdd: false }),
      });
      assert.equal(lock.status, 200);

      const denied = await fetch(base + "/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: JSON.stringify({ type: "comment", message: "should not land" }),
      });
      assert.equal(denied.status, 403);

      const allowed = await fetch(base + "/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://allowed.example",
        },
        body: JSON.stringify({ type: "comment", message: "from allowlist" }),
      });
      const body = await json(allowed);
      assert.equal(allowed.status, 201);
      assert.equal(body.item.message, "from allowlist");
    });
  } finally {
    await close();
    rmTempDir(dataDir);
  }
});
