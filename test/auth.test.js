"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createAuth, COOKIE_NAME, MIN_PASSWORD_LEN } = require("../lib/auth");
const { makeTempDir, rmTempDir, fakeReq } = require("./helpers");

function withAuth(overrides = {}) {
  const dataDir = makeTempDir();
  const auth = createAuth({
    adminPassword: "correct-horse",
    sessionSecret: "test-session-secret",
    dataDir,
    ...overrides,
  });
  return { auth, dataDir };
}

test("createAuth requires sessionSecret and dataDir", () => {
  const dataDir = makeTempDir();
  try {
    assert.throws(() => createAuth({ adminPassword: "x", dataDir }), /sessionSecret/);
    assert.throws(
      () => createAuth({ adminPassword: "x", sessionSecret: "short", dataDir }),
      /at least 16/
    );
    assert.throws(
      () => createAuth({ adminPassword: "x", sessionSecret: "test-session-secret" }),
      /dataDir/
    );
  } finally {
    rmTempDir(dataDir);
  }
});

test("verifyPassword accepts the bootstrap password and rejects others", () => {
  const { auth, dataDir } = withAuth();
  try {
    assert.equal(auth.verifyPassword("correct-horse"), true);
    assert.equal(auth.verifyPassword("wrong"), false);
    assert.equal(auth.verifyPassword(""), false);
  } finally {
    rmTempDir(dataDir);
  }
});

test("changePassword updates the hash and enforces a minimum length", () => {
  const { auth, dataDir } = withAuth();
  try {
    assert.throws(
      () => auth.changePassword("nope", "new-password"),
      (err) => err.status === 401
    );
    assert.throws(
      () => auth.changePassword("correct-horse", "short"),
      (err) => err.status === 400 && err.message.includes(String(MIN_PASSWORD_LEN))
    );
    auth.changePassword("correct-horse", "new-password");
    assert.equal(auth.verifyPassword("new-password"), true);
    assert.equal(auth.verifyPassword("correct-horse"), false);
  } finally {
    rmTempDir(dataDir);
  }
});

test("session tokens round-trip via the cookie and reject tampering", () => {
  const { auth, dataDir } = withAuth();
  try {
    const token = auth.createSessionToken();
    const req = fakeReq({
      headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}` },
    });
    assert.ok(auth.getSession(req));
    assert.equal(auth.isAuthenticated(req), true);
    assert.equal(auth.isSessionAuthenticated(req), true);

    const bad = fakeReq({
      headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(token.slice(0, -4) + "xxxx")}` },
    });
    assert.equal(auth.getSession(bad), null);
    assert.equal(auth.isAuthenticated(bad), false);

    assert.equal(auth.getSession(fakeReq()), null);
    assert.equal(auth.getSession(fakeReq({ headers: { cookie: `${COOKIE_NAME}=not-a-token` } })), null);
  } finally {
    rmTempDir(dataDir);
  }
});

test("API tokens verify as bearer auth and can be revoked", () => {
  const { auth, dataDir } = withAuth();
  try {
    const created = auth.createToken("ci");
    assert.ok(created.token.startsWith("tf_live_"));
    assert.equal(auth.verifyApiToken(created.token), true);
    assert.equal(auth.verifyApiToken("tf_live_nope"), false);
    assert.equal(auth.listTokens().length, 1);

    const req = fakeReq({
      headers: { authorization: `Bearer ${created.token}` },
    });
    assert.equal(auth.isAuthenticated(req), true);
    assert.equal(auth.isSessionAuthenticated(req), false);
    assert.equal(auth.getBearer(req), created.token);

    auth.revokeToken(created.id);
    assert.equal(auth.verifyApiToken(created.token), false);
    assert.throws(() => auth.revokeToken(created.id), (err) => err.status === 404);
  } finally {
    rmTempDir(dataDir);
  }
});

test("login attempt limiter trips after LOGIN_MAX_ATTEMPTS", () => {
  const { auth, dataDir } = withAuth();
  try {
    const ip = "203.0.113.9";
    assert.equal(auth.isRateLimited(ip), false);
    for (let i = 0; i < 10; i++) auth.recordLoginFailure(ip);
    assert.equal(auth.isRateLimited(ip), true);
    auth.clearLoginFailures(ip);
    assert.equal(auth.isRateLimited(ip), false);
  } finally {
    rmTempDir(dataDir);
  }
});

test("clientIp prefers the first X-Forwarded-For hop", () => {
  const { auth, dataDir } = withAuth();
  try {
    const req = fakeReq({
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
      socket: { remoteAddress: "10.0.0.1" },
    });
    assert.equal(auth.clientIp(req), "203.0.113.10");
    assert.equal(auth.clientIp(fakeReq({ socket: { remoteAddress: "127.0.0.1" } })), "127.0.0.1");
  } finally {
    rmTempDir(dataDir);
  }
});

test("session cookie is HttpOnly and Secure on forwarded HTTPS", () => {
  const { auth, dataDir } = withAuth();
  try {
    const token = auth.createSessionToken();
    const httpHeader = auth.sessionCookieHeader(token, fakeReq());
    assert.ok(httpHeader.includes("HttpOnly"));
    assert.ok(httpHeader.includes("SameSite=Lax"));
    assert.ok(!httpHeader.includes("Secure"));

    const httpsReq = fakeReq({ headers: { "x-forwarded-proto": "https" } });
    const httpsHeader = auth.sessionCookieHeader(token, httpsReq);
    assert.ok(httpsHeader.includes("Secure"));

    const cleared = auth.sessionCookieHeader("", fakeReq(), { clear: true });
    assert.ok(cleared.includes("Max-Age=0"));
  } finally {
    rmTempDir(dataDir);
  }
});
