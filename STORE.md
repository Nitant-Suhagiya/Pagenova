# Chrome Web Store listing guide

Use this checklist to prepare the Chrome Web Store (CWS) submission.

## 1. Single purpose

CWS requires a single, clearly stated purpose.

Pagenova's purpose: **grounded AI answers over your open tabs, uploaded
documents, and images**, using either a local Ollama server or a cloud provider
you configure.

Keep the name, summary, description, and screenshots focused on that job.
Settings, model pulling, and history support the main feature. They should not
lead the listing.

## 2. Store copy (starting points)

**Name:** Pagenova

**Short description** (≤ 132 chars):

> Grounded AI chat over your open tabs, documents, and images, with local Ollama or cloud models.

**Detailed description:**

> Pagenova answers questions about the page you're reading, a selected passage,
> any number of open tabs, or documents you upload, then grounds every answer in
> that content and cites its sources.
>
> • Grounded answers: retrieves passages from selected context and lists the
>   source for each answer.
> • Local option: use a local Ollama model and on-device embeddings, or connect
>   OpenAI, Anthropic, Google Gemini, or an OpenAI-compatible provider.
> • Multi-tab context: select several open tabs and ask about them together.
> • Documents: upload PDF, DOCX, TXT, CSV, or Markdown and ask about the file.
> • Images: attach, paste, or capture a screenshot. You can also right-click an
>   image and ask about it.
> • Privacy: no accounts, analytics, or advertising. History stays in the
>   browser, API keys last only for the current browser session, and Pagenova
>   reads page text only when you add it as context.

## 3. Permissions & justification

Use this table in the review form. Keep it consistent with `manifest.json`.

| Permission | Why Pagenova needs it |
| --- | --- |
| `sidePanel` | Opens the chat UI in Chrome's side panel. |
| `storage` | Persists non-secret settings locally and keeps user-supplied API keys only for the current browser session. |
| `activeTab` | Reads the current tab when you invoke the extension via the toolbar or right-click menu. |
| `tabs` | Lists your open tabs and their titles/URLs so you can pick which ones to ground the answer in. |
| `scripting` | Injects a text/image extraction function into a tab **on demand** (no persistent content script). |
| `contextMenus` | Adds "Summarize with AI" and "Ask AI about this image" to the right-click menu. |
| `offscreen` | Hosts the on-device embedding model (WASM) in a background context so the MV3 service worker can stay event-driven. |
| Host `http://*/*`, `https://*/*` | Reads page text/images from the tabs you select, fetches images you right-click, and calls only the local or cloud provider you select. |
| Optional host `<all_urls>` | Requested only after the user clicks Screenshot. It captures the visible active webpage after a tab change while Pagenova stays open. |

### Why the broad host permission is unavoidable

The core feature needs to read content from tabs and images on sites that are
not known in advance. A narrower pattern cannot support selecting any open tab
or asking about an image from any site.

Pagenova limits how it uses that access:

1. **No persistent injection.** The extension has no `content_scripts` entry.
   It injects an extraction function only when you add a page to the request.
2. **On-demand data flow.** Page text and images are fetched only for the
   request that uses them. They are not sent to a provider until you send that
   request. See `PRIVACY.md`.
3. **In-product consent.** Before Pagenova reads open-tab titles or URLs, it
   shows a Page Context disclosure and asks for an explicit opt-in.

## 4. Technical review notes

- **No remote code.** All extension code and the `ort-wasm-*.wasm` runtime are
  bundled at build time. The in-browser embedding model downloads as data on
  first use and is cached locally. Pagenova does not execute remotely hosted code.
- **No `web_accessible_resources`.** The package exposes nothing to web pages.
- **CSP:** `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. The
  `wasm-unsafe-eval` token is required to instantiate the bundled WASM embedder
  and is standard for on-device ML extensions.
- **`minimum_chrome_version: "116"`** is set because the side panel, offscreen
  document, and `runtime.getContexts` APIs used here first stabilized together
  at that version.
- **API keys are user-supplied** and stored only in `chrome.storage.session`.
  Chrome clears them when the browser restarts, and the extension ships with no
  built-in credentials.

## 5. Assets to upload

These are not in the repo and must be provided in the developer dashboard:

- **Icon 128×128** (required; PNG).
- **Screenshots**: upload the four prepared 1280×800 images from
  `store-assets/`, in their numbered order.
- **Small promo tile**: upload `store-assets/promo-440x280.png` (440×280
  PNG). It is required for the listing. The 1400×560 marquee tile is optional.
- **Privacy practices**: disclose that Pagenova handles website content,
  browsing activity (open-tab titles and URLs), and user-provided documents and
  images. These stay local unless the user sends them to their selected provider;
  there is no analytics or advertising use.

## 6. Release checklist

1. Bump `version` in `manifest.json` (semantic versioning; CWS requires a higher
   version than the live build on every update).
2. `npm run lint && npm test && npm run build`.
3. Run the QA matrix in `README.md` in a clean browser profile against a real
   Ollama server (or one cloud key).
4. Zip `dist/` (the directory's contents, not the enclosing folder) and upload.
5. Confirm the permission justifications in §3 match what the dashboard shows.
6. Enter the public privacy URL
   `https://nitant-suhagiya.github.io/pagenova/privacy.html` and matching
   disclosures in the Developer Dashboard before submitting.
7. After the review, keep the dashboard privacy form and this file in sync if
   permissions ever change.

## 7. Reviewer instructions

Use this in the dashboard's **Test instructions** field:

> Pagenova has no account or sign-in. For a local test, install the extension,
> open Settings, set Ollama to a reachable local server, choose a chat model,
> then ask a question. Page Context, selected-text context, file uploads, and
> screenshots are optional and require a model/provider you configure. Do not
> enter a real API key supplied by another person.
