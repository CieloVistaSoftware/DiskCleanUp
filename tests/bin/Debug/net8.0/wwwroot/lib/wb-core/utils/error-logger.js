const ERROR_LOG_PATH = "api/errors";
let errorContainer = null;
let errors = [];
let _cssLoaded = false;
function loadCSS() {
  if (_cssLoaded) return;
  _cssLoaded = true;
  const scriptUrl = import.meta.url;
  const cssUrl = new URL("../css/error-logger.css", scriptUrl).href;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = cssUrl;
  document.head.appendChild(link);
}
function initErrorDisplay() {
  if (errorContainer) return;
  loadCSS();
  errorContainer = document.createElement("div");
  errorContainer.id = "wb-error-display";
  errorContainer.setAttribute("role", "log");
  errorContainer.setAttribute("aria-label", "Error log");
  errorContainer.setAttribute("aria-live", "polite");
  errorContainer.innerHTML = `
    <div class="wb-err-header">
      <span class="wb-err-title">\u274C Errors (<span id="wb-error-count">0</span>)</span>
      <div class="wb-err-actions">
        <button id="wb-error-create-issues" class="wb-err-btn wb-err-btn-issues"
                title="File a GitHub issue for each error"
                aria-label="Create GitHub issues for all errors">Create Issues</button>
        <button id="wb-error-copy" class="wb-err-btn wb-err-btn-copy"
                title="Copy all errors to clipboard"
                aria-label="Copy all errors to clipboard">\u{1F4CB} Copy</button>
        <button id="wb-error-clear" class="wb-err-btn wb-err-btn-clear"
                title="Clear all errors"
                aria-label="Clear all errors">Clear</button>
        <button id="wb-error-close" class="wb-err-btn wb-err-btn-close"
                title="Close error panel"
                aria-label="Close error panel">\u2715</button>
      </div>
    </div>
    <div id="wb-error-list" role="list" aria-label="Error entries"></div>`;
  document.body.appendChild(errorContainer);
  document.getElementById("wb-error-create-issues").onclick = _createIssues;
  document.getElementById("wb-error-copy").onclick = _copyAll;
  document.getElementById("wb-error-clear").onclick = _clearAll;
  document.getElementById("wb-error-close").onclick = () => {
    errorContainer.style.display = "none";
  };
}
function _createIssues() {
  const REPO = "CieloVistaSoftware/DiskCleanUp";
  const seen = /* @__PURE__ */ new Set();
  const unique = errors.filter((e) => {
    const key = `${e.prefix}|${e.type}|${e.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length === 0) return;
  const btn = document.getElementById("wb-error-create-issues");
  if (btn) {
    btn.textContent = `Opening ${unique.length}\u2026`;
    btn.disabled = true;
  }
  unique.forEach((e, idx) => {
    const title = `[${e.prefix}] ${e.type}: ${e.message.slice(0, 80)}`;
    const body = [
      "## Error report (auto-filed from error log)",
      "",
      `**Prefix:** \`${e.prefix}\``,
      `**Type:** \`${e.type}\``,
      `**Message:** ${e.message}`,
      e.context ? `**Context:** ${e.context}` : "",
      e.filename ? `**File:** ${e.filename}:${e.lineno}` : "",
      "",
      `**Time:** ${new Date(e.timestamp).toLocaleString()}`,
      `**URL:** ${e.url}`,
      e.stack ? `
## Stack
\`\`\`
${e.stack.slice(0, 1500)}
\`\`\`` : ""
    ].filter((l) => l !== "").join("\n");
    const params = new URLSearchParams({ title, body, labels: "bug,project:diskcleanup" });
    setTimeout(() => window.open(`https://github.com/${REPO}/issues/new?${params}`, "_blank"), idx * 400);
  });
  setTimeout(() => {
    if (btn) {
      btn.textContent = "Create Issues";
      btn.disabled = false;
    }
  }, unique.length * 400 + 500);
}
async function _copyAll() {
  const copyBtn = document.getElementById("wb-error-copy");
  const errorText = errors.map((e, i) => {
    let text = `[${i + 1}] ${e.prefix || ""} [${e.type || "ERROR"}] ${e.message}`;
    if (e.filename) text += `
    File: ${e.filename}:${e.lineno || "?"}`;
    if (e.context) text += `
    Context: ${e.context}`;
    if (e.to) text += `
    To: ${e.to}`;
    if (e.stack) text += `
    Stack:
${e.stack.split("\n").map((l) => "      " + l.trim()).join("\n")}`;
    text += `
    Time: ${e.timestamp}`;
    text += `
    URL: ${e.url}`;
    return text;
  }).join("\n\n");
  const header = `=== ${errors.length} Error(s) at ${(/* @__PURE__ */ new Date()).toLocaleString()} ===
Page: ${window.location.href}

`;
  try {
    await navigator.clipboard.writeText(header + errorText);
    copyBtn.textContent = "\u2705 Copied!";
    copyBtn.classList.add("wb-err-btn-copied");
    setTimeout(() => {
      copyBtn.textContent = "\u{1F4CB} Copy";
      copyBtn.classList.remove("wb-err-btn-copied");
    }, 2e3);
  } catch (e) {
    copyBtn.textContent = "\u274C Failed";
    setTimeout(() => {
      copyBtn.textContent = "\u{1F4CB} Copy";
    }, 2e3);
  }
}
function _clearAll() {
  errors = [];
  document.getElementById("wb-error-list").innerHTML = "";
  updateErrorCount();
  saveErrorLog();
}
function parseStack(stack) {
  if (!stack) return { filename: "", lineno: 0, colno: 0 };
  const match = stack.match(/(?:at\s+(?:\S+\s+)?)\(?(.+?):(\d+):(\d+)\)?/);
  return match ? { filename: match[1].split("/").pop(), lineno: parseInt(match[2], 10), colno: parseInt(match[3], 10) } : { filename: "", lineno: 0, colno: 0 };
}
function inferType(err, overrideType) {
  if (overrideType) return overrideType;
  if (err instanceof TypeError || err instanceof ReferenceError || err instanceof SyntaxError) return "RUNTIME_ERROR";
  const msg = String(err?.message || err).toLowerCase();
  if (msg.includes("fetch") || /\b[345]\d{2}\b/.test(msg)) return "FETCH_ERROR";
  return "APP_ERROR";
}
async function logError(prefix, error, options = {}) {
  initErrorDisplay();
  const isErrorObj = error instanceof Error;
  const message = isErrorObj ? error.message : String(error);
  const stack = isErrorObj ? error.stack || "" : "";
  const { filename, lineno, colno } = parseStack(stack);
  const entry = {
    id: (() => {
      let h = 5381;
      const s = message + (stack.split("\n")[1] || "");
      for (let i = 0; i < s.length; i++) h = (h << 5) + h ^ s.charCodeAt(i);
      return h >>> 0;
    })(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    type: inferType(error, options.type),
    prefix,
    context: options.context || "",
    message,
    stack,
    filename,
    lineno,
    colno,
    to: options.to || "",
    url: window.location.href,
    userAgent: navigator.userAgent
  };
  errors.push(entry);
  updateErrorCount();
  const list = document.getElementById("wb-error-list");
  const item = document.createElement("div");
  item.className = "wb-err-item";
  item.setAttribute("role", "listitem");
  const time = new Date(entry.timestamp).toLocaleTimeString();
  let meta = "";
  if (entry.filename) meta += `<span class="wb-err-file">${escapeHtml(entry.filename)}:${entry.lineno}</span>`;
  if (entry.context) meta += `<span class="wb-err-context">${escapeHtml(entry.context)}</span>`;
  if (entry.to) meta += `<span class="wb-err-to">\u2192 ${escapeHtml(entry.to)}</span>`;
  item.innerHTML = `
    <div class="wb-err-item-head">
      <span class="wb-err-prefix">${escapeHtml(entry.prefix)} <span class="wb-err-type">${entry.type}</span></span>
      <time class="wb-err-time" datetime="${entry.timestamp}">${time}</time>
    </div>
    <div class="wb-err-message">${escapeHtml(entry.message)}</div>
    <div class="wb-err-meta">${meta}</div>
    ${entry.stack ? `<div class="wb-err-stack">${escapeHtml(entry.stack)}</div>` : ""}`;
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
  errorContainer.style.display = "block";
  await saveErrorLog();
  console.error(`${entry.prefix} [${entry.type}] ${entry.message}${entry.filename ? " (" + entry.filename + ":" + entry.lineno + ")" : ""}`);
  return entry;
}
let _saveInFlight = false;
const _pendingErrors = [];
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && _pendingErrors.length > 0) {
    const batch = _pendingErrors.splice(0);
    batch.forEach((entry) => _postError(entry));
  }
});
async function saveErrorLog() {
  if (_saveInFlight || errors.length === 0) return;
  const latest = errors[errors.length - 1];
  if (document.visibilityState === "hidden") {
    _pendingErrors.push(latest);
    return;
  }
  await _postError(latest);
}
async function _postError(entry) {
  if (_saveInFlight) return;
  _saveInFlight = true;
  try {
    await fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: entry.timestamp,
        type: entry.type,
        prefix: entry.prefix,
        message: entry.message,
        stack: entry.stack || "",
        filename: entry.filename || "",
        url: entry.url || ""
      })
    });
  } catch {
  }
  _saveInFlight = false;
}
async function loadErrorLog() {
  try {
    const response = await fetch(`/${ERROR_LOG_PATH}?t=${Date.now()}`);
    if (response.ok) {
      const data = await response.json();
      errors = data.errors || [];
      return data;
    }
  } catch (e) {
    console.warn("[ErrorLogger] Could not load error log:", e);
  }
  return { errors: [] };
}
function getErrors() {
  return errors;
}
async function clearErrors() {
  errors = [];
  const list = document.getElementById("wb-error-list");
  if (list) list.innerHTML = "";
  updateErrorCount();
  await saveErrorLog();
}
function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function updateErrorCount() {
  const countEl = document.getElementById("wb-error-count");
  if (countEl) countEl.textContent = String(errors.length);
}
function setupGlobalErrorHandler() {
  window.addEventListener("error", (event) => {
    logError("[global]", event.error || event.message, { type: "UNCAUGHT_ERROR", context: event.filename });
  });
  window.addEventListener("unhandledrejection", (event) => {
    logError("[global]", event.reason instanceof Error ? event.reason : String(event.reason), { type: "PROMISE_REJECTION" });
  });
}
var error_logger_default = { logError, loadErrorLog, getErrors, clearErrors, setupGlobalErrorHandler };
export {
  clearErrors,
  error_logger_default as default,
  getErrors,
  loadErrorLog,
  logError,
  setupGlobalErrorHandler
};
