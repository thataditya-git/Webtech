const K = (k) => "miniclaude:" + k;
const keyEl = document.getElementById("key");
const modelEl = document.getElementById("model");
const msg = document.getElementById("msg");

chrome.storage.local.get([K("apiKey"), K("model")], (o) => {
  if (o[K("apiKey")]) keyEl.value = o[K("apiKey")];
  if (o[K("model")]) modelEl.value = o[K("model")];
});

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.local.set(
    { [K("apiKey")]: keyEl.value.trim(), [K("model")]: modelEl.value },
    () => {
      msg.textContent = "Saved ✓ — reload your claude.ai tab.";
      setTimeout(() => (msg.textContent = ""), 2500);
    }
  );
});
