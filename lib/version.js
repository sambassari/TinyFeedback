"use strict";

const fs = require("fs");
const path = require("path");

const PACKAGE_JSON = path.join(__dirname, "..", "package.json");

function readVersion(pkgPath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath || PACKAGE_JSON, "utf8"));
    return String(pkg.version || "0.0.0");
  } catch {
    return "0.0.0";
  }
}

const VERSION = readVersion();

module.exports = { VERSION, readVersion };
