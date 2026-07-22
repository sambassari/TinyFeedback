(function () {
  "use strict";

  var listEl = document.getElementById("list");
  var themeBtn = document.getElementById("themeBtn");
  var refreshBtn = document.getElementById("refreshBtn");
  var logoutBtn = document.getElementById("logoutBtn");
  var tokenListEl = document.getElementById("tokenList");
  var tokenReveal = document.getElementById("tokenReveal");
  var tokenRevealValue = document.getElementById("tokenRevealValue");
  var tokenMsg = document.getElementById("tokenMsg");
  var passwordMsg = document.getElementById("passwordMsg");
  var domainListEl = document.getElementById("domainList");
  var domainMsg = document.getElementById("domainMsg");
  var installMsg = document.getElementById("installMsg");
  var publicUrlMsg = document.getElementById("publicUrlMsg");
  var publicUrlInput = document.getElementById("publicUrlInput");
  var publicUrlHint = document.getElementById("publicUrlHint");
  var autoAddDomains = document.getElementById("autoAddDomains");
  var filter = "all";
  var items = [];
  var tokensLoaded = false;
  var domainsLoaded = false;
  var settingsLoaded = false;
  var publicBaseUrl = "";

  function preferredTheme() {
    var saved = localStorage.getItem("tf-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("tf-theme", theme);
    themeBtn.textContent = theme === "dark" ? "Light" : "Dark";
  }

  function goLogin() {
    location.href = "/login.html";
  }

  function ensureAuth() {
    return fetch("/api/auth/me", { credentials: "same-origin" }).then(function (res) {
      if (res.status === 401) {
        goLogin();
        return Promise.reject(new Error("Unauthorized"));
      }
      if (!res.ok) throw new Error("Auth check failed");
      return res.json();
    });
  }

  function showMsg(el, text, isError) {
    el.hidden = false;
    el.classList.toggle("hidden", false);
    el.textContent = text;
    el.className =
      "mt-3 text-sm " + (isError ? "text-red-600 dark:text-red-400" : "text-muted");
  }

  function setTab(name) {
    var tabs = document.querySelectorAll("[data-tab]");
    for (var i = 0; i < tabs.length; i++) {
      var active = tabs[i].getAttribute("data-tab") === name;
      tabs[i].setAttribute("aria-selected", active ? "true" : "false");
      tabs[i].classList.toggle("is-active", active);
    }
    document.getElementById("panel-feedback").hidden = name !== "feedback";
    document.getElementById("panel-api").hidden = name !== "api";
    document.getElementById("panel-settings").hidden = name !== "settings";
    if (name === "api" && !tokensLoaded) loadTokens();
    if (name === "settings") {
      if (!settingsLoaded) loadSettings();
      else renderInstallSnippet();
      if (!domainsLoaded) loadDomains();
    }
    if (name === "feedback") load();
    try {
      history.replaceState(null, "", "#" + name);
    } catch (e) {
      /* ignore */
    }
  }

  function renderInstallSnippet() {
    var base = (publicBaseUrl || location.origin).replace(/\/$/, "");
    var snippet =
      '<script src="' +
      base +
      '/tinyfeedback.js"\n' +
      '  data-endpoint="' +
      base +
      '"></script>';
    document.getElementById("installSnippet").textContent = snippet;
  }

  function applySettings(data) {
    settingsLoaded = true;
    publicUrlInput.value = data.publicUrl || "";
    publicBaseUrl = data.effectivePublicUrl || data.publicUrl || location.origin;
    if (data.publicUrl) {
      publicUrlHint.textContent = "Install snippet uses this public URL.";
    } else {
      publicUrlHint.textContent =
        "Not set — snippet falls back to " + location.origin + ". Set your real domain (e.g. https://tinyfeedback.example.com).";
    }
    renderInstallSnippet();
  }

  function loadSettings() {
    fetch("/api/settings", { credentials: "same-origin" })
      .then(function (res) {
        if (res.status === 401) {
          goLogin();
          return Promise.reject(new Error("Unauthorized"));
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Failed to load settings");
          return data;
        });
      })
      .then(applySettings)
      .catch(function (err) {
        if (err.message === "Unauthorized") return;
        publicBaseUrl = location.origin;
        renderInstallSnippet();
        showMsg(publicUrlMsg, err.message, true);
      });
  }

  applyTheme(preferredTheme());

  themeBtn.addEventListener("click", function () {
    var next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    applyTheme(next);
  });

  logoutBtn.addEventListener("click", function () {
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).finally(goLogin);
  });

  document.querySelector('[role="tablist"]').addEventListener("click", function (e) {
    var btn = e.target.closest("[data-tab]");
    if (!btn) return;
    setTab(btn.getAttribute("data-tab"));
  });

  document.getElementById("filters").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-filter]");
    if (!btn) return;
    filter = btn.getAttribute("data-filter");
    var chips = document.querySelectorAll("#filters [data-filter]");
    for (var i = 0; i < chips.length; i++) {
      var active = chips[i].getAttribute("data-filter") === filter;
      chips[i].setAttribute("aria-pressed", active ? "true" : "false");
      chips[i].classList.toggle("is-active", active);
    }
    render();
  });

  refreshBtn.addEventListener("click", load);

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return iso;
    }
  }

  function typeLabel(item) {
    if (item.type === "nps") return "NPS " + String(item.score);
    if (item.type === "rating") return item.rating === "up" ? "Upvote" : "Downvote";
    if (item.type === "feature") return "Idea";
    return item.type.charAt(0).toUpperCase() + item.type.slice(1);
  }

  function npsBucket(score) {
    if (score >= 9) return "promoter";
    if (score >= 7) return "passive";
    return "detractor";
  }

  function updateStats(all) {
    document.getElementById("statTotal").textContent = String(all.length);
    document.getElementById("statBugs").textContent = String(
      all.filter(function (i) {
        return i.type === "bug";
      }).length
    );
    document.getElementById("statIdeas").textContent = String(
      all.filter(function (i) {
        return i.type === "feature";
      }).length
    );

    var npsItems = all.filter(function (i) {
      return i.type === "nps" && typeof i.score === "number";
    });
    var npsEl = document.getElementById("statNps");
    var breakdownEl = document.getElementById("npsBreakdown");
    var topPagesEl = document.getElementById("topPages");

    if (!npsItems.length) {
      npsEl.textContent = "—";
      breakdownEl.textContent = "No NPS scores yet. Scores use the standard 0–10 recommend scale.";
    } else {
      var promoters = 0;
      var passives = 0;
      var detractors = 0;
      var sum = 0;
      for (var i = 0; i < npsItems.length; i++) {
        var score = npsItems[i].score;
        sum += score;
        var bucket = npsBucket(score);
        if (bucket === "promoter") promoters += 1;
        else if (bucket === "passive") passives += 1;
        else detractors += 1;
      }
      var n = npsItems.length;
      var nps = Math.round(((promoters - detractors) / n) * 100);
      var avg = (sum / n).toFixed(1);
      npsEl.textContent = (nps > 0 ? "+" : "") + String(nps);
      breakdownEl.textContent =
        n +
        " responses · avg " +
        avg +
        " · " +
        promoters +
        " promoters · " +
        passives +
        " passives · " +
        detractors +
        " detractors";
    }

    var pageCounts = {};
    for (var p = 0; p < all.length; p++) {
      var url = all[p].pageUrl || "(no page)";
      pageCounts[url] = (pageCounts[url] || 0) + 1;
    }
    var ranked = Object.keys(pageCounts)
      .map(function (url) {
        return { url: url, count: pageCounts[url] };
      })
      .sort(function (a, b) {
        return b.count - a.count;
      })
      .slice(0, 3);
    if (!ranked.length) {
      topPagesEl.textContent = "";
    } else {
      topPagesEl.innerHTML =
        "Top pages: " +
        ranked
          .map(function (row) {
            return escapeHtml(row.url) + " (" + row.count + ")";
          })
          .join(" · ");
    }
  }

  function filtered() {
    if (filter === "all") return items;
    return items.filter(function (i) {
      return i.type === filter;
    });
  }

  function emptyState(text, isError) {
    return (
      '<div class="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm ' +
      (isError ? "text-red-600 dark:text-red-400" : "text-muted") +
      '">' +
      escapeHtml(text) +
      "</div>"
    );
  }

  function render() {
    updateStats(items);
    var rows = filtered();
    if (!rows.length) {
      listEl.innerHTML = emptyState("No feedback yet. Open the demo and send a few items.");
      return;
    }

    listEl.innerHTML = rows
      .map(function (item) {
        var message = item.message
          ? '<p class="mt-3 text-sm leading-relaxed text-foreground">' +
            escapeHtml(item.message) +
            "</p>"
          : '<p class="mt-3 text-sm text-muted">No message</p>';
        var contact =
          item.name || item.email
            ? '<p class="mt-2 text-sm text-foreground">' +
              (item.name ? escapeHtml(item.name) : "") +
              (item.name && item.email ? " · " : "") +
              (item.email
                ? '<a class="underline-offset-4 hover:underline" href="mailto:' +
                  escapeHtml(item.email) +
                  '">' +
                  escapeHtml(item.email) +
                  "</a>"
                : "") +
              "</p>"
            : "";
        var url = item.pageUrl
          ? '<p class="mt-2 truncate text-sm"><a class="text-foreground underline-offset-4 hover:underline" href="' +
            escapeHtml(item.pageUrl) +
            '" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(item.pageUrl) +
            "</a></p>"
          : "";
        return (
          '<article class="rounded-lg border border-border bg-card p-4">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<span class="inline-flex h-6 items-center rounded-full border border-border px-2.5 text-xs font-medium text-foreground">' +
          escapeHtml(typeLabel(item)) +
          "</span>" +
          '<button type="button" data-delete="' +
          escapeHtml(item.id) +
          '" class="inline-flex h-8 items-center rounded-full px-3 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40">Delete</button>' +
          "</div>" +
          message +
          contact +
          url +
          '<div class="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted">' +
          "<span>" +
          escapeHtml(formatDate(item.createdAt)) +
          "</span>" +
          "<span>" +
          escapeHtml(item.viewport || "") +
          (item.language ? " · " + escapeHtml(item.language) : "") +
          "</span>" +
          "</div>" +
          '<p class="mt-2 break-all text-xs text-muted">' +
          escapeHtml(item.userAgent || "") +
          "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  listEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-delete]");
    if (!btn) return;
    var id = btn.getAttribute("data-delete");
    if (!id || !confirm("Delete this feedback item?")) return;

    fetch("/api/feedback/" + encodeURIComponent(id), {
      method: "DELETE",
      credentials: "same-origin",
    })
      .then(function (res) {
        if (res.status === 401) {
          goLogin();
          return Promise.reject(new Error("Unauthorized"));
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Delete failed");
        });
      })
      .then(load)
      .catch(function (err) {
        if (err.message === "Unauthorized") return;
        listEl.innerHTML = emptyState(err.message, true);
      });
  });

  function load() {
    listEl.innerHTML = emptyState("Loading…");
    fetch("/api/feedback", { credentials: "same-origin" })
      .then(function (res) {
        if (res.status === 401) {
          goLogin();
          return Promise.reject(new Error("Unauthorized"));
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Failed to load");
          return data;
        });
      })
      .then(function (data) {
        items = data.items || [];
        render();
      })
      .catch(function (err) {
        if (err.message === "Unauthorized") return;
        listEl.innerHTML = emptyState(err.message, true);
      });
  }

  function renderTokens(tokens) {
    if (!tokens.length) {
      tokenListEl.innerHTML = emptyState("No API tokens yet.");
      return;
    }
    tokenListEl.innerHTML = tokens
      .map(function (t) {
        return (
          '<div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3">' +
          "<div>" +
          '<p class="text-sm font-medium">' +
          escapeHtml(t.name) +
          "</p>" +
          '<p class="mt-0.5 text-xs text-muted">' +
          escapeHtml(t.prefix) +
          " · " +
          escapeHtml(formatDate(t.createdAt)) +
          "</p>" +
          "</div>" +
          '<button type="button" data-revoke="' +
          escapeHtml(t.id) +
          '" class="inline-flex h-8 items-center rounded-full px-3 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40">Revoke</button>' +
          "</div>"
        );
      })
      .join("");
  }

  function loadTokens() {
    tokenListEl.innerHTML = emptyState("Loading…");
    fetch("/api/tokens", { credentials: "same-origin" })
      .then(function (res) {
        if (res.status === 401) {
          goLogin();
          return Promise.reject(new Error("Unauthorized"));
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Failed to load tokens");
          return data;
        });
      })
      .then(function (data) {
        tokensLoaded = true;
        renderTokens(data.tokens || []);
      })
      .catch(function (err) {
        if (err.message === "Unauthorized") return;
        tokenListEl.innerHTML = emptyState(err.message, true);
      });
  }

  document.getElementById("tokenForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = document.getElementById("tokenName").value.trim();
    fetch("/api/tokens", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "API token" }),
    })
      .then(function (res) {
        if (res.status === 401) {
          goLogin();
          return Promise.reject(new Error("Unauthorized"));
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Could not create token");
          return data;
        });
      })
      .then(function (data) {
        document.getElementById("tokenName").value = "";
        tokenReveal.classList.remove("hidden");
        tokenRevealValue.textContent = data.token.token;
        showMsg(tokenMsg, "Token created.", false);
        loadTokens();
      })
      .catch(function (err) {
        if (err.message === "Unauthorized") return;
        showMsg(tokenMsg, err.message, true);
      });
  });

  document.getElementById("tokenCopyBtn").addEventListener("click", function () {
    var value = tokenRevealValue.textContent || "";
    if (!value) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () {
        showMsg(tokenMsg, "Copied to clipboard.", false);
      });
      return;
    }
    showMsg(tokenMsg, "Select and copy the token manually.", false);
  });

  tokenListEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-revoke]");
    if (!btn) return;
    var id = btn.getAttribute("data-revoke");
    if (!id || !confirm("Revoke this token? Scripts using it will stop working.")) return;

    fetch("/api/tokens/" + encodeURIComponent(id), {
      method: "DELETE",
      credentials: "same-origin",
    })
      .then(function (res) {
        if (res.status === 401) {
          goLogin();
          return Promise.reject(new Error("Unauthorized"));
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Revoke failed");
        });
      })
      .then(function () {
        tokenReveal.classList.add("hidden");
        showMsg(tokenMsg, "Token revoked.", false);
        loadTokens();
      })
      .catch(function (err) {
        if (err.message === "Unauthorized") return;
        showMsg(tokenMsg, err.message, true);
      });
  });

  function renderDomains(state) {
    autoAddDomains.checked = state.autoAdd !== false;
    var list = state.domains || [];
    if (!list.length) {
      domainListEl.innerHTML = emptyState(
        state.autoAdd !== false
          ? "No domains yet. New sites are added automatically on first feedback."
          : "No domains listed — any site can send feedback until you add one and turn off auto-add."
      );
      return;
    }
    domainListEl.innerHTML = list
      .map(function (d) {
        return (
          '<div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3">' +
          '<code class="text-sm">' +
          escapeHtml(d) +
          "</code>" +
          '<button type="button" data-remove-domain="' +
          escapeHtml(d) +
          '" class="inline-flex h-8 items-center rounded-full px-3 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40">Remove</button>' +
          "</div>"
        );
      })
      .join("");
  }

  function loadDomains() {
    domainListEl.innerHTML = emptyState("Loading…");
    fetch("/api/domains", { credentials: "same-origin" })
      .then(function (res) {
        if (res.status === 401) {
          goLogin();
          return Promise.reject(new Error("Unauthorized"));
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Failed to load domains");
          return data;
        });
      })
      .then(function (data) {
        domainsLoaded = true;
        renderDomains(data);
      })
      .catch(function (err) {
        if (err.message === "Unauthorized") return;
        domainListEl.innerHTML = emptyState(err.message, true);
      });
  }

  document.getElementById("publicUrlForm").addEventListener("submit", function (e) {
    e.preventDefault();
    fetch("/api/settings", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicUrl: publicUrlInput.value.trim() }),
    })
      .then(function (res) {
        if (res.status === 401) {
          goLogin();
          return Promise.reject(new Error("Unauthorized"));
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Could not save public URL");
          return data;
        });
      })
      .then(function (data) {
        applySettings(data);
        showMsg(
          publicUrlMsg,
          data.publicUrl ? "Public URL saved." : "Public URL cleared — using current host.",
          false
        );
      })
      .catch(function (err) {
        if (err.message === "Unauthorized") return;
        showMsg(publicUrlMsg, err.message, true);
      });
  });

  document.getElementById("installCopyBtn").addEventListener("click", function () {
    var value = document.getElementById("installSnippet").textContent || "";
    if (!value) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () {
        showMsg(installMsg, "Snippet copied.", false);
      });
      return;
    }
    showMsg(installMsg, "Select and copy the snippet manually.", false);
  });

  autoAddDomains.addEventListener("change", function () {
    fetch("/api/domains", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoAdd: autoAddDomains.checked }),
    })
      .then(function (res) {
        if (res.status === 401) {
          goLogin();
          return Promise.reject(new Error("Unauthorized"));
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Could not update setting");
          return data;
        });
      })
      .then(function (data) {
        showMsg(
          domainMsg,
          data.autoAdd ? "Auto-add enabled." : "Auto-add disabled. Only listed domains can post.",
          false
        );
        renderDomains(data);
      })
      .catch(function (err) {
        if (err.message === "Unauthorized") return;
        showMsg(domainMsg, err.message, true);
        loadDomains();
      });
  });

  document.getElementById("domainForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var domain = document.getElementById("domainInput").value.trim();
    if (!domain) {
      showMsg(domainMsg, "Enter a domain.", true);
      return;
    }
    fetch("/api/domains", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: domain }),
    })
      .then(function (res) {
        if (res.status === 401) {
          goLogin();
          return Promise.reject(new Error("Unauthorized"));
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Could not add domain");
          return data;
        });
      })
      .then(function (data) {
        document.getElementById("domainInput").value = "";
        showMsg(domainMsg, "Added " + data.domain + ".", false);
        renderDomains(data);
      })
      .catch(function (err) {
        if (err.message === "Unauthorized") return;
        showMsg(domainMsg, err.message, true);
      });
  });

  domainListEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-remove-domain]");
    if (!btn) return;
    var domain = btn.getAttribute("data-remove-domain");
    if (!domain || !confirm("Remove " + domain + "?")) return;

    fetch("/api/domains/" + encodeURIComponent(domain), {
      method: "DELETE",
      credentials: "same-origin",
    })
      .then(function (res) {
        if (res.status === 401) {
          goLogin();
          return Promise.reject(new Error("Unauthorized"));
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Remove failed");
          return data;
        });
      })
      .then(function (data) {
        showMsg(domainMsg, "Domain removed.", false);
        renderDomains(data);
      })
      .catch(function (err) {
        if (err.message === "Unauthorized") return;
        showMsg(domainMsg, err.message, true);
      });
  });

  document.getElementById("passwordForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var currentPassword = document.getElementById("currentPassword").value;
    var newPassword = document.getElementById("newPassword").value;
    var confirmPassword = document.getElementById("confirmPassword").value;
    if (newPassword !== confirmPassword) {
      showMsg(passwordMsg, "New passwords do not match.", true);
      return;
    }
    fetch("/api/auth/password", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword }),
    })
      .then(function (res) {
        if (res.status === 401) {
          return res.json().then(function (data) {
            if (data && data.error === "Unauthorized") {
              goLogin();
              return Promise.reject(new Error("Unauthorized"));
            }
            throw new Error((data && data.error) || "Could not change password");
          });
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Could not change password");
          return data;
        });
      })
      .then(function () {
        document.getElementById("passwordForm").reset();
        showMsg(passwordMsg, "Password updated.", false);
      })
      .catch(function (err) {
        if (err.message === "Unauthorized") return;
        showMsg(passwordMsg, err.message, true);
      });
  });

  function loadVersion() {
    fetch("/api/config")
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.version) return;
        var el = document.getElementById("appVersion");
        if (el) el.textContent = "v" + data.version;
      })
      .catch(function () {});
  }

  ensureAuth()
    .then(function () {
      loadVersion();
      var hash = (location.hash || "").replace(/^#/, "");
      if (hash === "api" || hash === "settings" || hash === "feedback") setTab(hash);
      else setTab("feedback");
    })
    .catch(function () {});
})();
