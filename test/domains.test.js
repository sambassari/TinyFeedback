"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createDomainStore } = require("../lib/domains");
const { makeTempDir, rmTempDir, fakeReq } = require("./helpers");

function withStore() {
  const dataDir = makeTempDir();
  return { store: createDomainStore({ dataDir }), dataDir };
}

test("normalizeDomain accepts hostnames and origins", () => {
  const { store, dataDir } = withStore();
  try {
    assert.equal(store.normalizeDomain("Example.COM"), "example.com");
    assert.equal(store.normalizeDomain("https://Example.COM/path"), "https://example.com");
    assert.equal(store.normalizeDomain("http://localhost:3000"), "http://localhost:3000");
    assert.equal(store.normalizeDomain(""), "");
    assert.equal(store.normalizeDomain("://bad"), "");
  } finally {
    rmTempDir(dataDir);
  }
});

test("empty allowlist permits any origin", () => {
  const { store, dataDir } = withStore();
  try {
    assert.equal(store.isAllowed("https://anywhere.example"), true);
    assert.equal(store.isAllowed(""), true);
    const gate = store.authorize(fakeReq({ headers: { origin: "https://new.example" } }), "");
    assert.equal(gate.allowed, true);
  } finally {
    rmTempDir(dataDir);
  }
});

test("autoAdd registers unknown origins on authorize", () => {
  const { store, dataDir } = withStore();
  try {
    const gate = store.authorize(
      fakeReq({ headers: { origin: "https://shop.example" } }),
      ""
    );
    assert.equal(gate.allowed, true);
    assert.equal(gate.added, true);
    assert.deepEqual(store.list().domains, ["https://shop.example"]);

    const again = store.authorize(
      fakeReq({ headers: { origin: "https://shop.example" } }),
      ""
    );
    assert.equal(again.allowed, true);
    assert.equal(again.added, false);
  } finally {
    rmTempDir(dataDir);
  }
});

test("strict allowlist denies unknown origins", () => {
  const { store, dataDir } = withStore();
  try {
    store.add("https://allowed.example");
    store.setAutoAdd(false);
    assert.equal(store.list().autoAdd, false);

    const denied = store.authorize(
      fakeReq({ headers: { origin: "https://evil.example" } }),
      ""
    );
    assert.equal(denied.allowed, false);

    const allowed = store.authorize(
      fakeReq({ headers: { origin: "https://allowed.example" } }),
      ""
    );
    assert.equal(allowed.allowed, true);

    const byPageUrl = store.authorize(fakeReq(), "https://allowed.example/checkout");
    assert.equal(byPageUrl.allowed, true);
  } finally {
    rmTempDir(dataDir);
  }
});

test("hostname entries match any scheme on that host", () => {
  const { store, dataDir } = withStore();
  try {
    store.add("example.com");
    store.setAutoAdd(false);
    assert.equal(store.isAllowed("https://example.com"), true);
    assert.equal(store.isAllowed("http://example.com"), true);
    assert.equal(store.isAllowed("https://other.example"), false);
  } finally {
    rmTempDir(dataDir);
  }
});

test("corsOrigin echoes allowed origins and blanks denied ones", () => {
  const { store, dataDir } = withStore();
  try {
    store.add("https://allowed.example");
    store.setAutoAdd(false);
    assert.equal(
      store.corsOrigin(fakeReq({ headers: { origin: "https://allowed.example" } })),
      "https://allowed.example"
    );
    assert.equal(
      store.corsOrigin(fakeReq({ headers: { origin: "https://evil.example" } })),
      ""
    );
    assert.equal(store.corsOrigin(fakeReq()), "*");
  } finally {
    rmTempDir(dataDir);
  }
});

test("add rejects invalid input and remove is idempotent-failing", () => {
  const { store, dataDir } = withStore();
  try {
    assert.throws(() => store.add("://nope"), (err) => err.status === 400);
    store.add("https://keep.example");
    store.remove("https://keep.example");
    assert.throws(() => store.remove("https://keep.example"), (err) => err.status === 404);
  } finally {
    rmTempDir(dataDir);
  }
});
