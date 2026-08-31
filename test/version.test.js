"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { readVersion, VERSION } = require("../lib/version");
const { makeTempDir, rmTempDir } = require("./helpers");

const ROOT = path.join(__dirname, "..");

test("readVersion returns the version field from a package.json file", () => {
  const dir = makeTempDir();
  try {
    const pkg = path.join(dir, "package.json");
    fs.writeFileSync(pkg, JSON.stringify({ name: "x", version: "9.9.9" }));
    assert.equal(readVersion(pkg), "9.9.9");
  } finally {
    rmTempDir(dir);
  }
});

test("readVersion falls back to 0.0.0 when package.json is missing", () => {
  assert.equal(readVersion(path.join("/no-such-dir", "package.json")), "0.0.0");
});

test("readVersion falls back to 0.0.0 when version is absent or unreadable", () => {
  const dir = makeTempDir();
  try {
    const pkg = path.join(dir, "package.json");
    fs.writeFileSync(pkg, JSON.stringify({ name: "x" }));
    assert.equal(readVersion(pkg), "0.0.0");
    fs.writeFileSync(pkg, "{not json");
    assert.equal(readVersion(pkg), "0.0.0");
  } finally {
    rmTempDir(dir);
  }
});

test("VERSION matches this repo package.json", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(VERSION, pkg.version);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test("runtime Docker stage copies package.json so the image is not stuck at 0.0.0", () => {
  const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
  const stages = dockerfile.split(/^FROM /m).filter(Boolean);
  assert.ok(stages.length >= 2, "expected a multi-stage Dockerfile");
  const runtime = stages[stages.length - 1];
  assert.match(
    runtime,
    /COPY package\.json /,
    "final image stage must COPY package.json for lib/version.js"
  );
});
