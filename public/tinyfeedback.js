/*! TinyFeedback v1.2.0 | MIT | https://github.com/sambassari/TinyFeedback */
(function () {
  "use strict";

  if (window.TinyFeedback && window.TinyFeedback.__loaded) return;

  var SCRIPT = document.currentScript;
  var DEFAULTS = {
    endpoint: "",
    position: "right",
    label: "Feedback",
    title: "Send feedback",
    dark: "auto",
  };

  function attr(name, fallback) {
    if (!SCRIPT) return fallback;
    var v = SCRIPT.getAttribute("data-" + name);
    return v == null || v === "" ? fallback : v;
  }

  function resolveEndpoint(explicit) {
    if (explicit) return explicit.replace(/\/$/, "");
    var fromAttr = attr("endpoint", "");
    if (fromAttr) return fromAttr.replace(/\/$/, "");
    if (SCRIPT && SCRIPT.src) {
      try {
        return new URL(SCRIPT.src, location.href).origin;
      } catch (e) {}
    }
    return location.origin;
  }

  var css =
    ":host{all:initial;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased}" +
    "*{box-sizing:border-box}" +
    ".tf{--bg:#fafafa;--fg:#0a0a0a;--muted:#737373;--border:#e5e5e5;--card:#fff;--accent:#171717;--accent-fg:#fafafa;--danger:#dc2626;--ok:#16a34a;color:var(--fg)}" +
    ".tf[data-theme=dark]{--bg:#0a0a0a;--fg:#ededed;--muted:#a3a3a3;--border:#262626;--card:#111;--accent:#fafafa;--accent-fg:#0a0a0a;--danger:#f87171;--ok:#4ade80}" +
    ".tf-btn{position:fixed;z-index:2147483000;bottom:20px;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 16px;border:1px solid var(--border);border-radius:999px;background:var(--accent);color:var(--accent-fg);font:500 13px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.06);transition:opacity .15s ease,transform .15s ease}" +
    ".tf-btn:hover{opacity:.92}.tf-btn:active{transform:scale(.98)}" +
    ".tf-btn:focus-visible{outline:2px solid var(--fg);outline-offset:2px}" +
    ".tf-btn[data-side=right]{right:20px}.tf-btn[data-side=left]{left:20px}" +
    ".tf-btn svg{width:14px;height:14px;flex:0 0 auto}" +
    ".tf-backdrop{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.32);opacity:0;pointer-events:none;visibility:hidden;transition:opacity .2s ease,visibility .2s}" +
    ".tf-backdrop[data-open=true]{opacity:1;pointer-events:auto;visibility:visible}" +
    ".tf-panel{position:fixed;z-index:2147483002;bottom:72px;width:min(360px,calc(100vw - 24px));max-height:min(560px,calc(100vh - 100px));overflow:auto;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--card);color:var(--fg);box-shadow:0 8px 30px rgba(0,0,0,.12);transform:translateY(8px);opacity:0;pointer-events:none;visibility:hidden;transition:opacity .2s ease,transform .2s ease,visibility .2s}" +
    ".tf-panel[data-side=right]{right:20px}.tf-panel[data-side=left]{left:20px}" +
    ".tf-panel[data-open=true]{opacity:1;pointer-events:auto;visibility:visible;transform:none}" +
    ".tf-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}" +
    ".tf-title{margin:0;font:600 16px/1.25 ui-sans-serif,system-ui,sans-serif;letter-spacing:-.02em}" +
    ".tf-sub{margin:4px 0 0;color:var(--muted);font:13px/1.4 ui-sans-serif,system-ui,sans-serif}" +
    ".tf-close{appearance:none;width:32px;height:32px;border:1px solid var(--border);border-radius:999px;background:transparent;color:var(--muted);cursor:pointer;font-size:18px;line-height:1}" +
    ".tf-close:hover{color:var(--fg);background:var(--bg)}" +
    ".tf-tabs{display:grid;grid-template-columns:repeat(5,1fr);gap:3px;margin:0 0 12px;padding:3px;border:1px solid var(--border);border-radius:10px;background:var(--bg)}" +
    ".tf-tab{appearance:none;border:0;border-radius:8px;min-height:34px;background:transparent;color:var(--muted);font:500 11px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;padding:0 2px}" +
    ".tf-tab[aria-selected=true]{background:var(--card);color:var(--fg);box-shadow:0 1px 2px rgba(0,0,0,.06);border:1px solid var(--border)}" +
    ".tf-rates{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}" +
    ".tf-rate{appearance:none;min-height:48px;border:1px solid var(--border);border-radius:10px;background:var(--bg);font-size:20px;cursor:pointer}" +
    ".tf-rate[aria-pressed=true]{border-color:var(--fg);background:var(--card)}" +
    ".tf-nps{margin:0 0 12px}" +
    ".tf-nps-q{margin:0 0 8px;font:500 12px/1.35 ui-sans-serif,system-ui,sans-serif;color:var(--muted)}" +
    ".tf-scores{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:3px}" +
    ".tf-score{appearance:none;min-height:32px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--fg);font:600 11px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;padding:0}" +
    ".tf-score[aria-pressed=true]{border-color:var(--fg);background:var(--accent);color:var(--accent-fg)}" +
    ".tf-nps-ends{display:flex;justify-content:space-between;margin-top:6px;color:var(--muted);font:11px/1 ui-sans-serif,system-ui,sans-serif}" +
    ".tf-label{display:block;margin:0 0 6px;font:500 12px/1 ui-sans-serif,system-ui,sans-serif;color:var(--muted)}" +
    ".tf-textarea{width:100%;min-height:72px;resize:vertical;border:1px solid var(--border);border-radius:10px;padding:10px 12px;background:var(--bg);color:var(--fg);font:14px/1.45 ui-sans-serif,system-ui,sans-serif}" +
    ".tf-textarea:focus,.tf-input:focus{outline:2px solid var(--fg);outline-offset:1px;border-color:transparent}" +
    ".tf-contact{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}" +
    ".tf-input{width:100%;min-height:36px;border:1px solid var(--border);border-radius:10px;padding:8px 10px;background:var(--bg);color:var(--fg);font:13px/1.3 ui-sans-serif,system-ui,sans-serif}" +
    ".tf-meta{margin:8px 0 0;color:var(--muted);font:12px/1.4 ui-sans-serif,system-ui,sans-serif;word-break:break-all}" +
    ".tf-status{min-height:16px;margin:8px 0 0;font:12px/1.3 ui-sans-serif,system-ui,sans-serif;color:var(--muted)}" +
    ".tf-status[data-kind=error]{color:var(--danger)}.tf-status[data-kind=ok]{color:var(--ok)}" +
    ".tf-actions{display:flex;justify-content:flex-end;margin-top:12px}" +
    ".tf-submit{appearance:none;min-height:36px;padding:0 14px;border:0;border-radius:999px;background:var(--accent);color:var(--accent-fg);font:500 13px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer}" +
    ".tf-submit:disabled{opacity:.5;cursor:not-allowed}" +
    ".tf-hp{position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden}" +
    "@media (prefers-reduced-motion:reduce){.tf-btn,.tf-backdrop,.tf-panel{transition:none}}";

  function createWidget(options) {
    var opts = Object.assign({}, DEFAULTS, options || {});
    opts.endpoint = resolveEndpoint(opts.endpoint);
    opts.position = opts.position === "left" ? "left" : "right";
    opts.dark = opts.dark || attr("theme", DEFAULTS.dark);
    opts.label = opts.label || attr("label", DEFAULTS.label);
    opts.title = opts.title || attr("title", DEFAULTS.title);

    var host = document.createElement("div");
    host.id = "tinyfeedback-host";
    host.setAttribute("data-tinyfeedback", "1");
    document.documentElement.appendChild(host);

    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var style = document.createElement("style");
    style.textContent = css;
    root.appendChild(style);

    var wrap = document.createElement("div");
    wrap.className = "tf";
    root.appendChild(wrap);

    function theme() {
      var mode = opts.dark;
      if (mode === "auto") {
        mode =
          window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
      }
      wrap.setAttribute("data-theme", mode === "dark" ? "dark" : "light");
    }
    theme();
    if (window.matchMedia) {
      try {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", theme);
      } catch (e) {}
    }

    var launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "tf-btn";
    launcher.setAttribute("data-side", opts.position);
    launcher.setAttribute("aria-haspopup", "dialog");
    launcher.setAttribute("aria-expanded", "false");
    launcher.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H10l-4.2 3.15A.8.8 0 0 1 4.5 18.5V16A2.5 2.5 0 0 1 4 13.5v-7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span></span>';
    launcher.querySelector("span").textContent = opts.label;
    wrap.appendChild(launcher);

    var backdrop = document.createElement("div");
    backdrop.className = "tf-backdrop";
    backdrop.setAttribute("data-open", "false");
    backdrop.hidden = true;
    wrap.appendChild(backdrop);

    var panel = document.createElement("div");
    panel.className = "tf-panel";
    panel.setAttribute("data-side", opts.position);
    panel.setAttribute("data-open", "false");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", opts.title);
    panel.hidden = true;
    wrap.appendChild(panel);

    var state = { open: false, type: "nps", rating: null, score: null, busy: false };

    var scoreButtons = "";
    for (var s = 0; s <= 10; s++) {
      scoreButtons +=
        '<button type="button" class="tf-score" data-score="' +
        s +
        '" aria-label="Score ' +
        s +
        '" aria-pressed="false">' +
        s +
        "</button>";
    }

    panel.innerHTML =
      '<div class="tf-head"><div><h2 class="tf-title"></h2><p class="tf-sub">Takes about 10 seconds.</p></div>' +
      '<button type="button" class="tf-close" aria-label="Close">&times;</button></div>' +
      '<div class="tf-tabs" role="tablist">' +
      '<button type="button" class="tf-tab" data-type="nps" role="tab">NPS</button>' +
      '<button type="button" class="tf-tab" data-type="rating" role="tab">Rate</button>' +
      '<button type="button" class="tf-tab" data-type="comment" role="tab">Comment</button>' +
      '<button type="button" class="tf-tab" data-type="bug" role="tab">Bug</button>' +
      '<button type="button" class="tf-tab" data-type="feature" role="tab">Idea</button>' +
      "</div>" +
      '<div class="tf-nps">' +
      '<p class="tf-nps-q">How likely are you to recommend us? (0–10)</p>' +
      '<div class="tf-scores" role="group" aria-label="NPS score 0 to 10">' +
      scoreButtons +
      "</div>" +
      '<div class="tf-nps-ends"><span>Not likely</span><span>Extremely likely</span></div>' +
      "</div>" +
      '<div class="tf-rates">' +
      '<button type="button" class="tf-rate" data-rating="up" aria-label="Thumbs up" aria-pressed="false">👍</button>' +
      '<button type="button" class="tf-rate" data-rating="down" aria-label="Thumbs down" aria-pressed="false">👎</button>' +
      "</div>" +
      '<label class="tf-label" for="tf-message">Message</label>' +
      '<textarea class="tf-textarea" id="tf-message" maxlength="2000" placeholder="Optional note"></textarea>' +
      '<div class="tf-contact">' +
      '<label class="tf-label" style="margin:0">Name<input class="tf-input tf-name" type="text" maxlength="80" autocomplete="name" placeholder="Optional"></label>' +
      '<label class="tf-label" style="margin:0">Email<input class="tf-input tf-email" type="email" maxlength="254" autocomplete="email" placeholder="Optional"></label>' +
      "</div>" +
      '<label class="tf-hp" aria-hidden="true">Company<input type="text" class="tf-hp-input" name="company" tabindex="-1" autocomplete="off"></label>' +
      '<p class="tf-meta"></p><p class="tf-status" aria-live="polite"></p>' +
      '<div class="tf-actions"><button type="button" class="tf-submit">Send</button></div>';

    panel.querySelector(".tf-title").textContent = opts.title;
    var textarea = panel.querySelector(".tf-textarea");
    var nameInput = panel.querySelector(".tf-name");
    var emailInput = panel.querySelector(".tf-email");
    var hpInput = panel.querySelector(".tf-hp-input");
    var statusEl = panel.querySelector(".tf-status");
    var metaEl = panel.querySelector(".tf-meta");
    var submitBtn = panel.querySelector(".tf-submit");
    var ratesWrap = panel.querySelector(".tf-rates");
    var npsWrap = panel.querySelector(".tf-nps");
    var scoresWrap = panel.querySelector(".tf-scores");

    function pageMeta() {
      return {
        pageUrl: location.href,
        userAgent: navigator.userAgent,
        language: navigator.language || "",
        viewport: Math.round(window.innerWidth) + "x" + Math.round(window.innerHeight),
      };
    }

    function refreshMeta() {
      metaEl.textContent = pageMeta().pageUrl;
    }

    function setStatus(text, kind) {
      statusEl.textContent = text || "";
      if (kind) statusEl.setAttribute("data-kind", kind);
      else statusEl.removeAttribute("data-kind");
    }

    function syncTabs() {
      var tabs = panel.querySelectorAll(".tf-tab");
      for (var i = 0; i < tabs.length; i++) {
        var t = tabs[i];
        t.setAttribute("aria-selected", t.getAttribute("data-type") === state.type ? "true" : "false");
      }
      npsWrap.style.display = state.type === "nps" ? "block" : "none";
      ratesWrap.style.display = state.type === "rating" ? "grid" : "none";
      textarea.placeholder =
        state.type === "bug"
          ? "What went wrong?"
          : state.type === "feature"
            ? "What would make this better?"
            : state.type === "nps"
              ? "What is the main reason for your score?"
              : state.type === "rating"
                ? "Optional note"
                : "Your thoughts";
    }

    function syncRating() {
      var buttons = panel.querySelectorAll(".tf-rate");
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        b.setAttribute(
          "aria-pressed",
          b.getAttribute("data-rating") === state.rating ? "true" : "false"
        );
      }
    }

    function syncScore() {
      var buttons = panel.querySelectorAll(".tf-score");
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        var val = Number(b.getAttribute("data-score"));
        b.setAttribute("aria-pressed", state.score === val ? "true" : "false");
      }
    }

    function open() {
      state.open = true;
      panel.hidden = false;
      backdrop.hidden = false;
      void panel.offsetWidth;
      panel.setAttribute("data-open", "true");
      backdrop.setAttribute("data-open", "true");
      launcher.setAttribute("aria-expanded", "true");
      refreshMeta();
      setStatus("");
      syncTabs();
      setTimeout(function () {
        textarea.focus();
      }, 30);
    }

    function close() {
      state.open = false;
      panel.setAttribute("data-open", "false");
      backdrop.setAttribute("data-open", "false");
      launcher.setAttribute("aria-expanded", "false");
      launcher.focus();
      setTimeout(function () {
        if (!state.open) {
          panel.hidden = true;
          backdrop.hidden = true;
        }
      }, 200);
    }

    launcher.addEventListener("click", function () {
      if (state.open) close();
      else open();
    });
    backdrop.addEventListener("click", close);
    panel.querySelector(".tf-close").addEventListener("click", close);

    panel.querySelector(".tf-tabs").addEventListener("click", function (e) {
      var tab = e.target.closest(".tf-tab");
      if (!tab) return;
      state.type = tab.getAttribute("data-type");
      syncTabs();
      setStatus("");
    });

    ratesWrap.addEventListener("click", function (e) {
      var btn = e.target.closest(".tf-rate");
      if (!btn) return;
      state.rating = btn.getAttribute("data-rating");
      syncRating();
      setStatus("");
    });

    scoresWrap.addEventListener("click", function (e) {
      var btn = e.target.closest(".tf-score");
      if (!btn) return;
      state.score = Number(btn.getAttribute("data-score"));
      syncScore();
      setStatus("");
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.open) close();
    });

    submitBtn.addEventListener("click", function () {
      if (state.busy) return;
      var message = (textarea.value || "").trim();
      var name = (nameInput.value || "").trim();
      var email = (emailInput.value || "").trim();
      if (state.type === "nps" && (state.score == null || state.score < 0 || state.score > 10)) {
        setStatus("Pick a score from 0 to 10.", "error");
        return;
      }
      if (state.type === "rating" && !state.rating) {
        setStatus("Pick 👍 or 👎 first.", "error");
        return;
      }
      if ((state.type === "comment" || state.type === "bug" || state.type === "feature") && !message) {
        setStatus("Please add a short message.", "error");
        textarea.focus();
        return;
      }

      state.busy = true;
      submitBtn.disabled = true;
      setStatus("Sending…");

      fetch(opts.endpoint + "/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.assign(pageMeta(), {
            type: state.type,
            rating: state.type === "rating" ? state.rating : null,
            score: state.type === "nps" ? state.score : null,
            message: message,
            name: name,
            email: email,
            _hp: hpInput ? hpInput.value : "",
          })
        ),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error((data && data.error) || "Request failed");
            return data;
          });
        })
        .then(function () {
          setStatus("Thanks — feedback sent.", "ok");
          textarea.value = "";
          nameInput.value = "";
          emailInput.value = "";
          state.rating = null;
          state.score = null;
          syncRating();
          syncScore();
          setTimeout(close, 800);
        })
        .catch(function (err) {
          setStatus(err.message || "Could not send feedback.", "error");
        })
        .finally(function () {
          state.busy = false;
          submitBtn.disabled = false;
        });
    });

    syncTabs();
    syncRating();
    syncScore();
    refreshMeta();

    return {
      open: open,
      close: close,
      destroy: function () {
        host.remove();
      },
      options: opts,
    };
  }

  var api = {
    __loaded: true,
    version: "1.2.0",
    init: function (options) {
      if (api._instance) api._instance.destroy();
      api._instance = createWidget(options || {});
      return api._instance;
    },
  };

  window.TinyFeedback = api;

  var auto = !SCRIPT || SCRIPT.getAttribute("data-manual") == null;
  if (auto) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        api.init();
      });
    } else {
      api.init();
    }
  }
})();
