"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Allowed site origins for the public widget POST + CORS.
 * @param {{ dataDir: string }} config
 */
function createDomainStore(config) {
  const dataDir = config.dataDir;
  const file = path.join(dataDir, "domains.json");

  function ensureDataDir() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  }

  function writeJsonAtomic(target, data) {
    ensureDataDir();
    const tmp = target + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, target);
  }

  function defaultState() {
    return { autoAdd: true, domains: [] };
  }

  function readState() {
    ensureDataDir();
    if (!fs.existsSync(file)) return defaultState();
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      const domains = Array.isArray(data.domains)
        ? data.domains.map(normalizeDomain).filter(Boolean)
        : [];
      return {
        autoAdd: data.autoAdd !== false,
        domains: unique(domains),
      };
    } catch {
      return defaultState();
    }
  }

  function writeState(state) {
    writeJsonAtomic(file, {
      autoAdd: Boolean(state.autoAdd),
      domains: unique((state.domains || []).map(normalizeDomain).filter(Boolean)),
    });
  }

  function unique(list) {
    const seen = new Set();
    const out = [];
    for (const item of list) {
      if (seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
    return out;
  }

  /** Normalize to origin (scheme://host[:port]) or bare hostname. */
  function normalizeDomain(input) {
    const raw = String(input || "").trim();
    if (!raw) return "";
    try {
      const hadScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw);
      const withScheme = hadScheme ? raw : "https://" + raw;
      const u = new URL(withScheme);
      if (!u.hostname) return "";
      const host = u.hostname.toLowerCase();
      if (hadScheme) return u.origin;
      return host;
    } catch {
      return "";
    }
  }

  function originFromRequest(req, pageUrl) {
    const header = req.headers.origin;
    if (typeof header === "string" && header && header !== "null") {
      try {
        return new URL(header).origin;
      } catch {
        /* fall through */
      }
    }
    if (pageUrl) {
      try {
        return new URL(pageUrl).origin;
      } catch {
        /* fall through */
      }
    }
    const referer = req.headers.referer;
    if (typeof referer === "string" && referer) {
      try {
        return new URL(referer).origin;
      } catch {
        /* fall through */
      }
    }
    return "";
  }

  function matches(entry, origin) {
    if (!entry || !origin) return false;
    try {
      const o = new URL(origin);
      if (entry === o.origin) return true;
      if (!entry.includes("://") && entry === o.hostname.toLowerCase()) return true;
      return false;
    } catch {
      return false;
    }
  }

  function list() {
    return readState();
  }

  function setAutoAdd(autoAdd) {
    const state = readState();
    state.autoAdd = Boolean(autoAdd);
    writeState(state);
    return readState();
  }

  function add(domain) {
    const normalized = normalizeDomain(domain);
    if (!normalized) {
      const err = new Error("Invalid domain. Use example.com or https://example.com");
      err.status = 400;
      throw err;
    }
    const state = readState();
    if (!state.domains.includes(normalized)) {
      state.domains.push(normalized);
      writeState(state);
    }
    return { domain: normalized, ...readState() };
  }

  function remove(domain) {
    const normalized = normalizeDomain(domain) || String(domain || "").trim();
    const state = readState();
    const next = state.domains.filter((d) => d !== normalized && d !== domain);
    if (next.length === state.domains.length) {
      const err = new Error("Domain not found");
      err.status = 404;
      throw err;
    }
    state.domains = next;
    writeState(state);
    return state;
  }

  /**
   * Check whether an origin may call the public feedback API.
   * Empty list = open (any site). autoAdd does not mutate here.
   */
  function isAllowed(origin) {
    const state = readState();
    if (!origin) return true;
    if (state.domains.length === 0) return true;
    if (state.domains.some((d) => matches(d, origin))) return true;
    return Boolean(state.autoAdd);
  }

  /**
   * Authorize a feedback POST. When autoAdd is on, registers new origins.
   * @returns {{ allowed: boolean, origin: string, added: boolean }}
   */
  function authorize(req, pageUrl) {
    const origin = originFromRequest(req, pageUrl);
    if (!origin) return { allowed: true, origin: "", added: false };

    const state = readState();
    if (state.domains.some((d) => matches(d, origin))) {
      return { allowed: true, origin, added: false };
    }

    if (state.domains.length === 0 && !state.autoAdd) {
      return { allowed: true, origin, added: false };
    }

    if (state.autoAdd || state.domains.length === 0) {
      if (state.autoAdd) {
        const normalized = normalizeDomain(origin);
        if (normalized && !state.domains.includes(normalized)) {
          state.domains.push(normalized);
          writeState(state);
          return { allowed: true, origin, added: true };
        }
      }
      return { allowed: true, origin, added: false };
    }

    return { allowed: false, origin, added: false };
  }

  function corsOrigin(req) {
    const origin = originFromRequest(req, "");
    if (!origin) return "*";
    return isAllowed(origin) ? origin : "";
  }

  return {
    list,
    add,
    remove,
    setAutoAdd,
    authorize,
    isAllowed,
    corsOrigin,
    normalizeDomain,
    originFromRequest,
  };
}

module.exports = { createDomainStore };
