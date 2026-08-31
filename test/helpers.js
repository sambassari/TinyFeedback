"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tinyfeedback-"));
}

function rmTempDir(dir) {
  if (!dir) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function fakeReq(overrides = {}) {
  return {
    headers: { ...(overrides.headers || {}) },
    socket: overrides.socket || { remoteAddress: "127.0.0.1" },
  };
}

module.exports = { makeTempDir, rmTempDir, fakeReq };
