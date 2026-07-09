/* Builds mini-claude-azure.user.js from mini-claude-azure-core.js.
 * core.js is the single source of truth - edit it, then run:  node build.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const VERSION = "1.1.0";

const HEADER = `// ==UserScript==
// @name         Mini Claude (Azure test) - quick-doubt sidekick
// @namespace    https://github.com/mini-claude
// @version      ${VERSION}
// @description  Test build. Calls your local proxy (which talks to your Azure deployment) instead of an API directly. Ask small doubts on claude.ai without a new turn.
// @author       you
// @match        https://claude.ai/*
// @icon         https://claude.ai/favicon.ico
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// @noframes
// ==/UserScript==

/* eslint-disable */
/* GENERATED FILE - do not edit directly. Edit mini-claude-azure-core.js and run: node build.js */
(function () {
  "use strict";
`;

const FOOTER = `
  const storage = {
    get: async (k) => { try { return GM_getValue("miniclaude:" + k, null); } catch (e) { return null; } },
    set: async (k, v) => { try { GM_setValue("miniclaude:" + k, v); } catch (e) {} },
  };
  function boot() { if (window.MiniClaude) window.MiniClaude.init(storage); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
`;

const core = fs.readFileSync(path.join(__dirname, "mini-claude-azure-core.js"), "utf8");
const out = HEADER + core + FOOTER;
if (/[^\x00-\x7F]/.test(out)) {
  console.error("ERROR: output contains non-ASCII characters; use \\uXXXX escapes in core.js");
  process.exit(1);
}
fs.writeFileSync(path.join(__dirname, "mini-claude-azure.user.js"), out);
console.log("Built mini-claude-azure.user.js (v" + VERSION + ", " + out.length + " bytes)");
