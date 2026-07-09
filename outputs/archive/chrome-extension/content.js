/* Chrome extension entry: wire MiniClaude to chrome.storage.local. */
(function () {
  "use strict";

  const storage = {
    get: (k) =>
      new Promise((resolve) => {
        chrome.storage.local.get("miniclaude:" + k, (o) => {
          resolve(o["miniclaude:" + k] ?? null);
        });
      }),
    set: (k, v) =>
      new Promise((resolve) => {
        chrome.storage.local.set({ ["miniclaude:" + k]: v }, resolve);
      }),
  };

  if (window.MiniClaude) window.MiniClaude.init(storage);
})();
