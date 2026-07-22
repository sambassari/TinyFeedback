"use strict";

const fs = require("fs");
const path = require("path");

/**
 * App settings (public TinyFeedback URL, etc).
 * @param {{ dataDir: string, envPublicUrl?: string }} config
 */
function createSettingsStore(config) {
  const dataDir = config.dataDir;
  const file = path.join(dataDir, "settings.json");
  const envPublicUrl = normalizePublicUrl(config.envPublicUrl || "");

  function ensureDataDir() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  }

  function writeJsonAtomic(target, data) {
    ensureDataDir();
    const tmp = target + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, target);
  }

  function normalizePublicUrl(input) {
    const raw = String(input || "").trim();
    if (!raw) return "";
    try {
      const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : "https://" + raw;
      const u = new URL(withScheme);
      if (!u.hostname) return "";
      return u.origin;
    } catch {
      return "";
    }
  }

  function readState() {
    ensureDataDir();
    if (!fs.existsSync(file)) {
      return { publicUrl: envPublicUrl };
    }
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      const fromFile = normalizePublicUrl(data && data.publicUrl);
      return {
        publicUrl: fromFile || envPublicUrl,
      };
    } catch {
      return { publicUrl: envPublicUrl };
    }
  }

  function writeState(state) {
    writeJsonAtomic(file, {
      publicUrl: normalizePublicUrl(state.publicUrl),
    });
  }

  function get() {
    return readState();
  }

  function setPublicUrl(input) {
    const publicUrl = normalizePublicUrl(input);
    if (String(input || "").trim() && !publicUrl) {
      const err = new Error(
        "Invalid public URL. Use https://tinyfeedback.example.com"
      );
      err.status = 400;
      throw err;
    }
    writeState({ publicUrl });
    return readState();
  }

  /** Prefer saved public URL; else derive from the incoming request. */
  function resolveBaseUrl(req) {
    const saved = readState().publicUrl;
    if (saved) return saved;
    return requestOrigin(req);
  }

  function requestOrigin(req) {
    if (!req || !req.headers) return "";
    const protoHeader = req.headers["x-forwarded-proto"];
    const proto =
      (typeof protoHeader === "string" && protoHeader.split(",")[0].trim()) ||
      (req.socket && req.socket.encrypted ? "https" : "http");
    const hostHeader = req.headers["x-forwarded-host"] || req.headers.host;
    if (!hostHeader || typeof hostHeader !== "string") return "";
    const host = hostHeader.split(",")[0].trim();
    if (!host) return "";
    try {
      return new URL(proto + "://" + host).origin;
    } catch {
      return "";
    }
  }

  return {
    get,
    setPublicUrl,
    resolveBaseUrl,
    normalizePublicUrl,
    requestOrigin,
  };
}

module.exports = { createSettingsStore };
