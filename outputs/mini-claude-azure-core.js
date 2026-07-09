/* =========================================================================
 * Mini Claude - AZURE / BACKEND variant (for testing the frontend)
 *
 * Same widget as the direct version, but it calls YOUR proxy instead of an
 * LLM API directly. Settings holds a Backend URL (default the local proxy).
 * No API key lives in the browser - the proxy holds it.
 *
 * Host must call: MiniClaude.init({ get, set })   (settings keys: "backend")
 * ========================================================================= */
(function () {
  "use strict";

  const DEFAULT_BACKEND = "http://localhost:8787";
  const MAX_CONTEXT_CHARS = 12000;

  /* ---------------- context grabbing ---------------- */
  const ASSISTANT_SELECTORS = [
    '[data-testid="assistant-message"]',
    ".font-claude-message",
    '[data-message-author-role="assistant"]',
    ".prose",
  ];
  // Last real page selection, captured the instant it's made (selectionchange
  // fires continuously during a drag). Opening the panel / focusing its input
  // collapses the browser's live selection, so grabContext() can't rely on
  // querying window.getSelection() at send time - it reads this snapshot instead.
  let capturedSelection = { text: "", full: "" };

  function clip(s) {
    s = s.replace(/\s+\n/g, "\n").trim();
    if (s.length > MAX_CONTEXT_CHARS) s = s.slice(0, MAX_CONTEXT_CHARS) + "\n\u2026[trimmed]";
    return s;
  }
  function isInsideWidget(node) {
    const root = document.getElementById("mc-root");
    return !!(root && node && root.contains(node));
  }
  function assistantAncestor(node) {
    let n = node;
    while (n && n !== document.body) {
      if (n.nodeType === 1) {
        for (const sel of ASSISTANT_SELECTORS) {
          if (n.matches && n.matches(sel)) return n;
        }
      }
      n = n.parentNode;
    }
    return null;
  }
  function nearestAssistantMessage() {
    let nodes = [];
    for (const sel of ASSISTANT_SELECTORS) {
      nodes = Array.from(document.querySelectorAll(sel));
      if (nodes.length) break;
    }
    if (!nodes.length) return null;
    const vpCenter = window.innerHeight / 2;
    let best = null, bestDist = Infinity;
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      if (r.height === 0) continue;
      const center = r.top + r.height / 2;
      const dist = Math.abs(center - vpCenter);
      if (dist < bestDist) { bestDist = dist; best = n; }
    }
    return best;
  }
  // Runs on every selectionchange in the whole document (not gated on the
  // panel being open), so a highlight made right before opening the widget
  // is already saved by the time the widget steals focus.
  function captureSelectionIfAny() {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = String(sel).trim();
    if (text.length < 2) return;
    if (isInsideWidget(sel.anchorNode)) return; // selecting inside our own UI doesn't count
    const container = assistantAncestor(sel.anchorNode) || nearestAssistantMessage();
    capturedSelection = {
      text: clip(text),
      full: container ? clip(container.innerText || "") : "",
    };
  }
  document.addEventListener("selectionchange", captureSelectionIfAny);
  function grabContext() {
    if (capturedSelection.text) {
      return { source: "your selection", text: capturedSelection.text, full: capturedSelection.full };
    }
    const el = nearestAssistantMessage();
    if (el) {
      const full = clip(el.innerText || "");
      return { source: "the answer on screen", text: full, full: full };
    }
    return { source: null, text: "", full: "" };
  }

  /* ---------------- backend call (plain-text stream) ---------------- */
  async function streamAnswer({ backend, messages, onDelta, signal }) {
    const url = backend.replace(/\/$/, "") + "/ask";
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok || !res.body) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 600); } catch (e) {}
      throw new Error("Backend error " + res.status + (detail ? ": " + detail : ""));
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      onDelta(decoder.decode(value, { stream: true }));
    }
  }

  /* ---------------- tiny markdown ---------------- */
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function renderMarkdown(md) {
    // Stash code blocks behind \x00-delimited placeholders: a bare " N "
    // placeholder would collide with real numbers in the prose.
    const blocks = [];
    md = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      blocks.push("<pre><code>" + esc(code.replace(/\n$/, "")) + "</code></pre>");
      return "\x00MCB" + (blocks.length - 1) + "\x00";
    });
    let html = esc(md);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    html = html.split(/\n{2,}/).map((p) => "<p>" + p.replace(/\n/g, "<br>") + "</p>").join("");
    html = html.replace(/\x00MCB(\d+)\x00/g, (_, i) => blocks[+i]);
    return html;
  }

  /* ---------------- UI ---------------- */
  const CSS = `
  #mc-root, #mc-root * { box-sizing: border-box; }
  #mc-fab { position: fixed; right:22px; bottom:22px; z-index:2147483000;
    width:48px; height:48px; border-radius:50%; cursor:pointer; background:#242426;
    color:#d6d6d8; border:1px solid #323234; box-shadow:0 4px 16px rgba(0,0,0,.35);
    font:400 19px/1 system-ui,sans-serif; display:flex; align-items:center;
    justify-content:center; transition:background .15s ease, transform .12s ease; }
  #mc-fab:hover { background:#2e2e30; transform:translateY(-1px); }
  #mc-panel { position:fixed; right:22px; bottom:82px; z-index:2147483000;
    width:372px; max-width:calc(100vw - 24px); height:520px;
    max-height:calc(100vh - 120px); background:#1a1a1c; color:#e6e6e6;
    border:1px solid #2c2c2e; border-radius:14px; box-shadow:0 16px 48px rgba(0,0,0,.5);
    display:none; flex-direction:column; overflow:hidden;
    font-family:system-ui,-apple-system,Segoe UI,sans-serif; font-size:14px; }
  #mc-panel.mc-open { display:flex; }
  #mc-head { display:flex; align-items:center; gap:6px; padding:11px 12px;
    background:#1f1f21; border-bottom:1px solid #2c2c2e; cursor:move; user-select:none; }
  #mc-head b { font-weight:600; font-size:13px; letter-spacing:.2px; color:#e6e6e6; }
  #mc-head b span { opacity:.4; font-weight:400; }
  #mc-head .mc-spacer { flex:1; }
  #mc-head button { background:none; border:none; color:#7e7e82; cursor:pointer;
    padding:4px; border-radius:6px; display:flex; align-items:center; transition:.12s; }
  #mc-head button:hover { background:#2a2a2c; color:#e6e6e6; }
  #mc-head button svg { display:block; }
  #mc-head .mc-txtbtn { font-size:11.5px; font-weight:500; padding:4px 8px; }
  #mc-ctx { padding:7px 12px; font-size:12px; color:#8a8a8e; background:#161617;
    border-bottom:1px solid #2c2c2e; display:flex; align-items:center; gap:6px; }
  #mc-ctx label { display:flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap; }
  #mc-ctx input[type=checkbox] { accent-color:#6a6a6e; }
  #mc-ctx .mc-src { color:#b0b0b4; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    flex:1; min-width:0; }
  #mc-ctxclear { display:none; background:none; border:none; color:#7e7e82; cursor:pointer;
    padding:0 3px; font-size:12px; border-radius:4px; line-height:1; }
  #mc-ctxclear:hover { color:#e6e6e6; }
  #mc-log { flex:1; overflow-y:auto; padding:14px 12px; }
  .mc-msg { margin-bottom:14px; line-height:1.55; }
  .mc-msg.mc-user { text-align:right; }
  .mc-msg.mc-user .mc-bubble { background:#323234; color:#f0f0f0;
    border-radius:12px 12px 3px 12px; padding:8px 11px; display:inline-block;
    max-width:88%; white-space:pre-wrap; word-break:break-word; }
  .mc-msg.mc-ai .mc-bubble { background:#242426; color:#e6e6e6;
    border-radius:12px 12px 12px 3px; padding:9px 12px; display:inline-block;
    max-width:95%; word-break:break-word; }
  .mc-bubble p { margin:0 0 8px; } .mc-bubble p:last-child { margin:0; }
  .mc-bubble pre { background:#111112; padding:9px; border-radius:8px; overflow:auto;
    margin:6px 0; font-size:12.5px; }
  .mc-bubble code { background:#111112; padding:1px 5px; border-radius:4px; font-size:12.5px; }
  .mc-bubble pre code { background:none; padding:0; }
  .mc-empty { color:#6a6a6e; text-align:center; margin-top:44px; font-size:13px; line-height:1.7; }
  #mc-input-wrap { border-top:1px solid #2c2c2e; padding:10px; background:#1f1f21; }
  #mc-input { width:100%; resize:none; background:#242426; color:#e6e6e6;
    border:1px solid #323234; border-radius:10px; padding:10px 12px; font:inherit;
    max-height:120px; outline:none; transition:border-color .12s; }
  #mc-input::placeholder { color:#6a6a6e; }
  #mc-input:focus { border-color:#5a5a5e; }
  #mc-row { display:flex; gap:8px; align-items:center; margin-top:8px; }
  #mc-send { background:#e8e8ea; color:#1a1a1c; border:none; border-radius:8px;
    padding:8px 16px; font-weight:600; cursor:pointer; font-size:13px; margin-left:auto;
    transition:background .12s; }
  #mc-send:hover { background:#fff; }
  #mc-send:disabled { opacity:.4; cursor:default; }
  #mc-settings { padding:16px; display:none; flex-direction:column; gap:10px; overflow-y:auto; }
  #mc-settings.mc-open { display:flex; }
  #mc-settings label { font-size:12px; color:#a0a0a4; }
  #mc-settings input { background:#242426; color:#e6e6e6; border:1px solid #323234;
    border-radius:8px; padding:9px 11px; font:inherit; width:100%; outline:none; }
  #mc-settings input:focus { border-color:#5a5a5e; }
  #mc-settings .mc-hint { font-size:11.5px; color:#6a6a6e; line-height:1.5; }
  #mc-save { background:#e8e8ea; color:#1a1a1c; border:none; border-radius:8px;
    padding:10px; font-weight:600; cursor:pointer; }
  #mc-save:hover { background:#fff; }
  .mc-err { color:#e0736a; font-size:12.5px; }
  `;

  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }

  function init(storage) {
    if (document.getElementById("mc-root")) return;

    const style = el("style"); style.textContent = CSS;
    document.head.appendChild(style);
    const root = el("div", { id: "mc-root" }); document.body.appendChild(root);

    const fab = el("button", { id: "mc-fab", title: "Mini Claude" }, "\u2726");
    root.appendChild(fab);

    const panel = el("div", { id: "mc-panel" });
    panel.innerHTML = `
      <div id="mc-head">
        <b>Mini Claude <span>test</span></b>
        <span class="mc-spacer"></span>
        <button id="mc-clear" class="mc-txtbtn" title="Clear chat">Clear</button>
        <button id="mc-gear" title="Settings"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
        <button id="mc-close" title="Close"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div id="mc-ctx">
        <label><input type="checkbox" id="mc-usectx" checked> Use on-screen context</label>
        <span id="mc-ctxsrc" class="mc-src"></span>
        <button id="mc-ctxclear" title="Dismiss selection">\u2715</button>
      </div>
      <div id="mc-log"></div>
      <div id="mc-input-wrap">
        <textarea id="mc-input" rows="1" placeholder="Ask a quick doubt\u2026  (Enter to send)"></textarea>
        <div id="mc-row"><button id="mc-send">Send</button></div>
      </div>
      <div id="mc-settings">
        <label>Backend URL</label>
        <input id="mc-backend" type="text" placeholder="http://localhost:8787" autocomplete="off">
        <div class="mc-hint">Your proxy that talks to Azure. Default is the local
          test server. No API key is stored in the browser.</div>
        <button id="mc-save">Save</button>
        <div id="mc-savemsg" class="mc-hint"></div>
      </div>
    `;
    root.appendChild(panel);

    const $ = (id) => panel.querySelector(id);
    const log = $("#mc-log");
    const input = $("#mc-input");
    const sendBtn = $("#mc-send");
    const settings = $("#mc-settings");
    const backendInput = $("#mc-backend");
    const usectx = $("#mc-usectx");
    const ctxSrc = $("#mc-ctxsrc");

    const history = [];
    let busy = false;
    let abortCtrl = null;
    // Selection already sent as context; lets a NEW highlight mid-conversation
    // be attached to the next message instead of only the first one.
    let lastAttachedSelection = "";

    function showEmpty() {
      log.innerHTML =
        '<div class="mc-empty">Highlight text in the answer, or just ask.<br>' +
        "I'll answer here without touching your main chat.</div>";
    }
    showEmpty();

    (async () => {
      const backend = (await storage.get("backend")) || DEFAULT_BACKEND;
      backendInput.value = backend;
    })();

    function togglePanel() {
      panel.classList.toggle("mc-open");
      if (panel.classList.contains("mc-open")) { refreshCtxLabel(); input.focus(); }
    }
    fab.addEventListener("click", togglePanel);
    $("#mc-close").addEventListener("click", () => panel.classList.remove("mc-open"));
    $("#mc-clear").addEventListener("click", () => {
      history.length = 0;
      capturedSelection = { text: "", full: "" };
      lastAttachedSelection = "";
      showEmpty();
      refreshCtxLabel();
    });
    $("#mc-ctxclear").addEventListener("click", () => {
      capturedSelection = { text: "", full: "" };
      refreshCtxLabel();
    });
    $("#mc-gear").addEventListener("click", () => settings.classList.toggle("mc-open"));
    $("#mc-save").addEventListener("click", async () => {
      await storage.set("backend", backendInput.value.trim() || DEFAULT_BACKEND);
      $("#mc-savemsg").textContent = "Saved \u2713";
      setTimeout(() => settings.classList.remove("mc-open"), 600);
    });

    function refreshCtxLabel() {
      const ctxClear = $("#mc-ctxclear");
      ctxClear.style.display = usectx.checked && capturedSelection.text ? "block" : "none";
      if (!usectx.checked) { ctxSrc.textContent = "off"; ctxSrc.title = ""; return; }
      const c = grabContext();
      if (!c.source) { ctxSrc.textContent = "\u2192 none found"; ctxSrc.title = ""; return; }
      const preview = c.text.length > 40 ? c.text.slice(0, 40) + "\u2026" : c.text;
      ctxSrc.textContent = "\u2192 " + c.source + ': "' + preview + '"';
      ctxSrc.title = c.text;
    }
    usectx.addEventListener("change", refreshCtxLabel);
    document.addEventListener("selectionchange", () => {
      if (panel.classList.contains("mc-open")) refreshCtxLabel();
    });

    function addMsg(role, initialHtml) {
      const m = el("div", { class: "mc-msg " + (role === "user" ? "mc-user" : "mc-ai") });
      const b = el("div", { class: "mc-bubble" }, initialHtml || "");
      m.appendChild(b); log.appendChild(m);
      log.scrollTop = log.scrollHeight;
      return b;
    }

    async function send() {
      if (busy) return;
      const q = input.value.trim();
      if (!q) return;
      const backend = (await storage.get("backend")) || backendInput.value.trim() || DEFAULT_BACKEND;

      if (log.querySelector(".mc-empty")) log.innerHTML = "";
      input.value = ""; input.style.height = "auto";
      addMsg("user", esc(q));

      let content = q;
      if (usectx.checked) {
        const c = grabContext();
        const isNewSelection =
          c.source === "your selection" && c.text && c.text !== lastAttachedSelection;
        if (c.text && (history.length === 0 || isNewSelection)) {
          if (c.source === "your selection" && c.full && c.full.length > c.text.length) {
            content =
              'FULL ANSWER (reference only, for background - don\'t summarize this back):\n"""\n' +
              c.full + '\n"""\n\n' +
              "HIGHLIGHTED PART (my question is specifically about this):\n\"\"\"\n" +
              c.text + '\n"""\n\nMY QUESTION: ' + q;
          } else {
            content = 'CONTEXT (' + c.source + '):\n"""\n' + c.text + '\n"""\n\nMY QUESTION: ' + q;
          }
          if (c.source === "your selection") lastAttachedSelection = c.text;
        }
      }
      history.push({ role: "user", content });

      const bubble = addMsg("ai", '<span style="opacity:.6">\u2026</span>');
      let acc = "";
      busy = true; abortCtrl = new AbortController();
      sendBtn.textContent = "Stop";
      try {
        await streamAnswer({
          backend,
          // Cap what we resend upstream so a long side-chat doesn't grow
          // the request (and cost) without bound.
          messages: history.slice(-10),
          signal: abortCtrl.signal,
          onDelta: (t) => {
            acc += t;
            bubble.innerHTML = renderMarkdown(acc);
            log.scrollTop = log.scrollHeight;
          },
        });
        history.push({ role: "assistant", content: acc });
      } catch (e) {
        if (e && e.name === "AbortError") {
          if (acc) history.push({ role: "assistant", content: acc });
          else { history.pop(); bubble.innerHTML = '<span style="opacity:.5">(stopped)</span>'; }
        } else {
          bubble.innerHTML = '<span class="mc-err">' + esc(String(e.message || e)) +
            '</span><br><span class="mc-hint" style="color:#7d7975">Is the proxy running? (node server.js)</span>';
          history.pop();
        }
      } finally {
        busy = false; abortCtrl = null;
        sendBtn.textContent = "Send";
        input.focus();
      }
    }

    sendBtn.addEventListener("click", () => {
      if (busy) { if (abortCtrl) abortCtrl.abort(); return; }
      send();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });
    document.addEventListener("keydown", (e) => {
      if (e.altKey && (e.key === "m" || e.key === "M")) { e.preventDefault(); togglePanel(); }
      if (e.key === "Escape" && panel.classList.contains("mc-open")) panel.classList.remove("mc-open");
    });

    (function makeDraggable() {
      const head = $("#mc-head");
      let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
      head.addEventListener("mousedown", (e) => {
        if (e.target.tagName === "BUTTON") return;
        dragging = true;
        const r = panel.getBoundingClientRect();
        ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
        panel.style.right = "auto"; panel.style.bottom = "auto";
        panel.style.left = ox + "px"; panel.style.top = oy + "px";
        e.preventDefault();
      });
      document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        panel.style.left = ox + (e.clientX - sx) + "px";
        panel.style.top = oy + (e.clientY - sy) + "px";
      });
      document.addEventListener("mouseup", () => (dragging = false));
    })();
  }

  window.MiniClaude = { init };
})();
