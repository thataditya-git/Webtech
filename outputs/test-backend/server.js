/* =========================================================================
 * Mini Claude — local test proxy for Azure AI Foundry (any chat deployment)
 *
 * Holds your Azure key server-side and forwards the widget's request to the
 * Azure Chat Completions API, streaming the answer back as plain text.
 * This is the seed of your real backend — for now it just runs on localhost.
 *
 * Run:
 *   1) copy .env.example -> .env and fill in your Azure values
 *   2) node server.js
 *
 * Needs Node 18+ (uses built-in fetch). No npm install required.
 * ========================================================================= */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

// ---- tiny .env loader (no dependency) ----
(function loadEnv() {
  try {
    const p = path.join(__dirname, ".env");
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch (e) {}
})();

const PORT = process.env.PORT || 8787;
const ENDPOINT = (process.env.AZURE_ENDPOINT || "").replace(/\/$/, "");
const KEY = process.env.AZURE_API_KEY || "";
const DEPLOYMENT = process.env.AZURE_DEPLOYMENT || "o4-mini";
const API_VERSION = process.env.AZURE_API_VERSION || "2024-12-01-preview";

const SYSTEM_PROMPT =
  "You are Mini Claude, a compact side-assistant embedded on top of the " +
  "claude.ai chat page. The user is reading a longer answer and wants to ask " +
  "a quick clarifying doubt about it. You may be given a FULL ANSWER block " +
  "(the whole assistant message on screen, background only) together with a " +
  "HIGHLIGHTED PART block (the exact text they selected) — when both appear, " +
  "answer specifically about the HIGHLIGHTED PART, using the FULL ANSWER only " +
  "to resolve references like 'this'/'that'/pronouns and stay consistent with " +
  "the surrounding explanation; don't summarize the full answer back to them. " +
  "If only a plain CONTEXT block is given (no selection was made), treat it as " +
  "what 'this'/'that'/'the answer above' refers to. Answer briefly and " +
  "directly, a few sentences unless asked to expand.";

function cors(res) {
  // Only claude.ai may call this proxy from a browser; a wildcard would let
  // any website you visit spend your Azure quota via localhost.
  res.setHeader("Access-Control-Allow-Origin", "https://claude.ai");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  // Chrome Private Network Access: allow an https page to reach localhost.
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

const server = http.createServer(async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("Mini Claude proxy is running. POST to /ask");
    return;
  }
  if (req.method !== "POST" || req.url !== "/ask") {
    res.writeHead(404).end("not found");
    return;
  }

  if (!ENDPOINT || !KEY) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Server not configured: set AZURE_ENDPOINT and AZURE_API_KEY in .env");
    return;
  }

  // ---- read request body ----
  let body = "";
  req.on("data", (c) => {
    body += c;
    if (body.length > 1e6) {
      res.writeHead(413, { "content-type": "text/plain" }).end("payload too large");
      req.destroy();
    }
  });
  req.on("end", async () => {
    let payload;
    try {
      payload = JSON.parse(body || "{}");
    } catch (e) {
      res.writeHead(400).end("bad json");
      return;
    }
    const messages = Array.isArray(payload.messages) ? payload.messages : [];

    const url =
      ENDPOINT +
      "/openai/deployments/" +
      DEPLOYMENT +
      "/chat/completions?api-version=" +
      API_VERSION;

    let upstream;
    try {
      upstream = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "api-key": KEY },
        body: JSON.stringify({
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
          // o4-mini is a reasoning model: uses max_completion_tokens, no temperature.
          max_completion_tokens: 2000,
          stream: true,
        }),
      });
    } catch (e) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("Upstream fetch failed: " + e.message);
      return;
    }

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      res.writeHead(upstream.status || 502, { "content-type": "text/plain" });
      res.end("Azure error " + upstream.status + ": " + detail.slice(0, 800));
      return;
    }

    // ---- stream: parse Azure SSE, forward plain text deltas ----
    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache",
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          const l = line.trim();
          if (!l.startsWith("data:")) continue;
          const data = l.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const j = JSON.parse(data);
            const delta =
              j.choices && j.choices[0] && j.choices[0].delta &&
              j.choices[0].delta.content;
            if (delta) res.write(delta);
          } catch (e) {}
        }
      }
    } catch (e) {
      res.write("\n[stream error: " + e.message + "]");
    }
    res.end();
  });
});

server.listen(PORT, () => {
  console.log("Mini Claude proxy on http://localhost:" + PORT);
  console.log("  endpoint:", ENDPOINT || "(missing!)");
  console.log("  deployment:", DEPLOYMENT, "| api-version:", API_VERSION);
  if (!KEY) console.log("  WARNING: AZURE_API_KEY not set");
});
