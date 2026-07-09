# Mini Claude — Azure test setup

Goal: see the widget actually answer on claude.ai, powered by your Azure
model deployment. You run a tiny local proxy that holds your Azure key; the
widget talks to that proxy. No key ever sits in the browser.

```
claude.ai  →  Mini Claude widget  →  http://localhost:8787  →  Azure deployment
                                       (test-backend/server.js)
```

You need **Node 18+** installed (`node -v` to check).

---

## 1. Deploy a model in Azure AI Foundry

In the Azure AI Foundry portal, create/choose a resource and **deploy a small
chat model** (this project currently uses a deployment named `gpt-5.4-nano`).
Then from the deployment's page grab three things:

- **Endpoint** — the base resource URL only, like
  `https://your-resource.openai.azure.com` (no path or query string)
- **API key**
- **Deployment name** — whatever you named it

## 2. Configure the proxy

In the `test-backend` folder:

1. Copy `.env.example` to `.env`.
2. Fill in `AZURE_ENDPOINT`, `AZURE_API_KEY`, `AZURE_DEPLOYMENT`.

## 3. Run the proxy

From inside `test-backend`:

```
node server.js
```

You should see `Mini Claude proxy on http://localhost:8787`. Leave it running.
Quick check — open `http://localhost:8787` in a browser; it should say the proxy
is running.

## 4. Install the widget

Use the **Azure test** build (not the direct-API one):

- **Tampermonkey:** create a new script, paste in `mini-claude-azure.user.js`, save.

The widget defaults to `http://localhost:8787`, so there's nothing to configure.
(If you changed the port, open the widget's ⚙ settings and update the Backend URL.)

## 5. Test it

1. Open **claude.ai** and any conversation.
2. Click the **✦** button (bottom-right) or press **Alt+M**.
3. Highlight a sentence in an answer, then ask e.g. "explain this more simply."
4. The reply should stream into the little panel. Your main chat stays untouched.

---

## If it doesn't work

- **Panel error "Is the proxy running?"** → the `node server.js` window isn't
  running, or the port differs from the widget's Backend URL.
- **"Azure error 401"** → wrong `AZURE_API_KEY`.
- **"Azure error 404" / DeploymentNotFound** → `AZURE_DEPLOYMENT` doesn't match
  the name you gave the deployment, or the endpoint URL is wrong.
- **Request blocked / CORS / network error in console** → make sure you're on
  the latest proxy (it sends the Private Network Access header Chrome needs to
  let an https page reach localhost). Restart `node server.js` after any change.
- **"none found" next to the context toggle** → claude.ai changed its markup;
  update `ASSISTANT_SELECTORS` at the top of `mini-claude-azure-core.js`.

## Note on cost & model

The proxy works with any Azure chat deployment — switching models only means
changing `AZURE_DEPLOYMENT` in `.env`. When you're ready to charge users, we
add login + Stripe on top of this same proxy.
