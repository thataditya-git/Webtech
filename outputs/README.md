# Mini Claude — quick-doubt sidekick for claude.ai

A floating quick-chat that sits on top of claude.ai. When you're reading a long
answer and have a small doubt, you ask it in the little widget instead of adding
a new turn to your main thread — so the original answer stays put and you don't
lose your scroll position.

- **Grabs what you're looking at.** Highlight text in an answer and it sends the
  full answer as background plus your highlighted part as the focus of the
  question. With nothing highlighted it uses the answer nearest the middle of
  your screen. Toggle off anytime; dismiss a stale selection with the ✕ chip.
- **Streams replies** into the widget; press **Stop** to cancel mid-answer.
- **No API key in the browser.** The widget talks to your local proxy
  (`test-backend/server.js`), which holds the Azure key.
- Open/close with the **✦ button**, **Alt+M**, or **Esc**. Drag it by its
  header. **Clear** resets the mini-chat.

## Setup

See **TEST-SETUP.md** — deploy a model in Azure AI Foundry, fill in
`test-backend/.env`, run `node server.js`, install the userscript in
Tampermonkey.

## Development

`mini-claude-azure-core.js` is the single source of truth for the widget.
After editing it, regenerate the installable userscript:

```
node build.js        # writes mini-claude-azure.user.js
```

Never edit `mini-claude-azure.user.js` by hand. Keep both files pure ASCII —
use `\uXXXX` escapes for icons (this machine's shell locale has mangled UTF-8
in clipboard copies before).

## Files

```
mini-claude-azure-core.js   # widget source (UI + context grabbing + streaming)
build.js                    # generates the userscript from the core
mini-claude-azure.user.js   # GENERATED - install this in Tampermonkey
test-backend/
  server.js                 # local proxy holding the Azure key
  .env                      # your Azure credentials (never commit)
  .env.example              # template
TEST-SETUP.md               # step-by-step setup guide
archive/                    # old direct-Anthropic-API builds (userscript +
                            # Chrome extension), kept for reference
```

- The widget finds answers via `ASSISTANT_SELECTORS` at the top of the core;
  if claude.ai changes its markup and context grabbing breaks, update that list.
