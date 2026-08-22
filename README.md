# Pagenova

A browser-native AI assistant (Chrome extension, Manifest V3) that grounds chat
in your open tabs, uploaded documents, and images, using either a **local
[Ollama](https://ollama.com) model** (nothing leaves your machine) or a **cloud
provider** (OpenAI, Anthropic, Google Gemini, or any OpenAI-compatible
endpoint).

It includes a retrieval pipeline (chunk, embed, retrieve) for content that
does not fit in a single model context window. Responses stream as they arrive,
the Stop button cancels a request, and conversations can be resumed later.

Pagenova is open source under the [MIT License](LICENSE). Contributions are
welcome, whether you are fixing a bug, improving a provider integration, or
making the extension easier to use.

> **User documentation:** [guide](https://nitant-suhagiya.github.io/pagenova/),
> [privacy policy](https://nitant-suhagiya.github.io/pagenova/privacy.html), and
> [support](https://nitant-suhagiya.github.io/pagenova/support.html). Source:
> [docs/index.html](docs/index.html).

---

## Table of contents

1. [Features](#features)
2. [Requirements](#requirements)
3. [Quickstart](#quickstart)
4. [Build & verify](#build--verify)
5. [Setup](#setup)
   - [Ollama (local models)](#ollama-local-models)
   - [Cloud providers](#cloud-providers)
   - [Embedding backends](#embedding-backends)
6. [Usage guide](#usage-guide)
   - [Chat](#chat)
   - [Page & tab context](#page--tab-context)
   - [Documents (RAG)](#documents-rag)
   - [Images & vision](#images--vision)
   - [Web search](#web-search)
   - [History](#history)
7. [Configuration reference](#configuration-reference)
8. [Architecture](#architecture)
   - [High-level flow](#high-level-flow)
   - [Component breakdown](#component-breakdown)
   - [Message protocol](#message-protocol)
   - [RAG internals](#rag-internals)
9. [Providers](#providers)
10. [Security & privacy](#security--privacy)
11. [Project structure](#project-structure)
12. [Development](#development)
    - [Scripts](#scripts)
    - [Tests](#tests)
13. [Contributing](#contributing)
14. [Manual QA matrix](#manual-qa-matrix)
15. [Troubleshooting](#troubleshooting)
16. [Roadmap](#roadmap)

---

## Features

- **Side panel + full-tab UI**: the same chat surface (`ChatPanel.tsx`)
  renders in Chrome's side panel or in a standalone tab, with a one-click
  expand/collapse that preserves the conversation.
- **Providers**: Ollama (local), OpenAI, Anthropic, Google Gemini, and a
  generic "Other compatible" (OpenAI-compatible) endpoint. A provider only
  appears in the dropdown after its API key is saved, so the UI never offers a
  provider you haven't configured.
- **Streaming and cancellation**: responses arrive as `CHAT_CHUNK` deltas over
  a long-lived port; the Stop button aborts the in-flight request via an
  `AbortController` registered in the background worker.
- **Conversation memory**: prior turns are sent as chat history, so follow-ups
  such as "elaborate on your second point" work. The most recent attached image
  is also included in a follow-up so vision models can refer back to it.
- **Multi-tab context**: select any number of open tabs from a list. Answers
  are grounded across all of them.
- **Page grounding**: extracts page text on demand via `chrome.scripting`
  injection (no persistent content script), so retrieval only runs when you
  reference a page.
- **Document RAG**: upload PDF / DOCX / TXT / CSV / MD (plus common code
  extensions); text is chunked, embedded, and retrieved against your question.
- **Embedding backends**: in-browser `Transformers.js` (default, runs
  fully on-device) or an Ollama embedding model (e.g. `nomic-embed-text`).
- **Vision**: upload images, paste from clipboard, capture the visible tab,
  right-click an image → "Ask AI about this image", or attach images found on
  the page. Non-vision models show an inline warning before you waste a turn.
- **Chat history**: IndexedDB sessions with image thumbnails, newest-first
  listing, and Markdown export.
- **Web search**: optionally ground answers with DuckDuckGo results (free,
  keyless) or Tavily (full results, needs a key).
- **Dark / light theme**, in-app model pull with progress, and a claymorphism
  design with soft layered shadows and rounded controls.

---

## Requirements

- **Node 20.19+** (or 22.12+) and npm.
- **Chrome** (the side-panel API requires Chrome 116+; the offscreen-document
  API requires Chrome 109+).
- **Ollama**, only if you want local models (optional; cloud-only setups skip
  it).

---

## Quickstart

```bash
npm install
npm run build          # outputs to dist/
```

Install Pagenova from the Chrome Web Store, then pin it and click its toolbar
icon to open the side panel.

If you want a local model, see [Ollama setup](#ollama-local-models) before your
first message. For cloud, paste a key in **Settings** → **Cloud providers**.

---

## Build & verify

| Command             | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR.                                           |
| `npm run build`     | Type-checks, builds, fixes the worker loader, and verifies `dist/`.  |
| `npm run verify:dist` | Checks the built extension's required files and worker entry.       |
| `npm test`          | Run the Vitest suite once.                                          |
| `npm run lint`      | Run oxlint.                                                         |
| `npm run preview`   | Preview the built web assets.                                       |

`scripts/fix-loader.js` rewrites the CRXJS service-worker loader to point at
the hashed background bundle. `scripts/verify-dist.js` then checks the
extension pages, manifest entry, and referenced worker asset. The build is not
complete without both steps.

---

## Setup

### Ollama (local models)

Ollama blocks `chrome-extension://` origins by default. The `chat` and `tags`
endpoints usually work anyway, but **`pull` and embeddings return `403`** until
CORS is configured.

Use the exact `chrome-extension://<extension-id>` origin shown in Pagenova
Settings. A specific extension ID is the safer production setting. Multiple
origins are comma-separated.

On Windows, set the variable permanently, then restart the Ollama app (or
reboot). The tray app picks up the persisted variable, so no terminal needs to
stay open:

```powershell
setx OLLAMA_ORIGINS "chrome-extension://<extension-id>"
```

On macOS/Linux, launch Ollama with the same variable:

```bash
OLLAMA_ORIGINS="chrome-extension://<extension-id>" ollama serve
```

Pull a text model and, optionally, a vision model:

```powershell
ollama pull llama3.2:1b
ollama pull llava          # for local vision
```

> **Tip:** on a low-RAM / CPU-only machine, prefer `llama3.2:1b` over
> `llama3.2:3b`. A 3B model with full page context can exhaust several GB of RAM
> and return `500` mid-generation. The README's `llama3.1` default in code is
> just a fallback; the model dropdown lists everything Ollama reports.

### Cloud providers

1. Open **Settings** (gear icon in the chat header).
2. Paste the API key under the provider you want (OpenAI, Anthropic, or Gemini).
3. Click **Save settings**. The provider appears in the chat dropdown.
4. Most OpenAI-compatible providers (DeepSeek, OpenRouter, Groq, etc.) work via
   **Other compatible**. Set the base URL *and* the key, e.g. DeepSeek:
   `https://api.deepseek.com/v1`.

### Embedding backends

RAG embeddings can come from two places (Settings → **Embedding backend (RAG)**):

| Backend          | Model                        | Dims | Notes                                              |
| ---------------- | ---------------------------- | ---- | -------------------------------------------------- |
| **In-browser**   | `Xenova/all-MiniLM-L6-v2`    | 384  | Default. Downloads the model once, runs fully on-device via `Transformers.js` + WASM. |
| **Ollama**       | `nomic-embed-text` (default) | 768  | Uses your local Ollama server. Pull it first via the **Pull** button. |

> **Important:** changing the embedding backend does **not** re-index existing
> content. The retrieval layer detects a dimension mismatch and skips stale
> chunks (warning you in the console). Re-upload documents or clear stored data
> to rebuild the index after switching backends.

---

## Usage guide

### Chat

Type a question and press **Enter** (or **Shift+Enter** for a newline). The
answer streams in and the **Send** button becomes **Stop** while generating.

- Providers and models are selected from the two dropdowns in the header.
- The current session auto-persists to `chrome.storage.session` so a panel
  reload doesn't lose it, and completed turns save to IndexedDB history.

### Page & tab context

Click the **+** button to open the context menu and tick any number of open
tabs. A status pill above the messages tells you what happened:

- `Using full page context (N sources)`: the selected content fit comfortably,
  so it was injected verbatim.
- `Retrieved excerpts from N sources`: content was too large, so the RAG
  pipeline chunked, embedded, and retrieved the most relevant excerpts.
- `Indexing context…`: shown while documents/tabs are being chunked and
  embedded for retrieval.

You can also highlight text on the active webpage, type a question, and press
**Send**. Pagenova reads that selection only for the request, then lists it as
`Selected text` in the answer's sources. It does not track selections while you
browse.

### Documents (RAG)

Upload documents from the **+** menu. Supported formats:

- **Text/code**: `.txt`, `.md`, `.csv`, `.log`, `.json`, `.js`, `.ts`, `.tsx`,
  `.py`, `.html`, `.css`, read as plain text.
- **PDF**: text extracted with `pdfjs-dist`.
- **DOCX**: text extracted with `mammoth`.

Legacy binary `.doc` is **not** supported and produces an inline error listing
the offending filename. Uploaded docs are hashed by content, so re-uploading a
same-named file with different contents correctly triggers re-indexing.

### Images & vision

Attach images by:

- **File picker** (image icon in the **+** menu),
- **Paste** (`Ctrl+V` on an image),
- **Drag-and-drop** onto the panel,
- **Screenshot** (camera icon, captures the visible tab). On first use, allow
  optional screenshot access so it can keep capturing the active webpage after
  you switch tabs without reopening Pagenova,
- **From this page** (lists prominent `<img>`/`<canvas>` elements),
- **Right-click → "Ask AI about this image"** on any image.

Images larger than the configured max edge are downscaled to JPEG at the
configured quality before sending. For Ollama models, Pagenova reads each
model's declared capabilities, rather than guessing from its name, before it
shows a vision warning. The most recent image remains available for the next
follow-up in that conversation.

### Web search

Toggle the globe icon in the header to ground the answer with live search
results. The query is sent to DuckDuckGo (default, free, keyless) or Tavily
(full results; set a key in Settings). It works with every provider, including
Ollama. With Ollama, the model stays local but the enabled search request goes
to the selected search provider.

### History

The clock icon opens the history overlay. It shows one entry per conversation,
newest first, with image thumbnails. You can reopen a session, delete it, or
export the current conversation as a self-contained Markdown file.

---

## Configuration reference

Non-secret settings live in `chrome.storage.local` and are edited from the
**Settings** page. Provider and Tavily API keys live only in
`chrome.storage.session`, so Chrome clears them when the browser restarts.

| Setting                     | Default                                   | Purpose                                                        |
| --------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| `ollamaBaseUrl`             | `http://localhost:11434`                  | Local Ollama server.                                           |
| `openaiApiKey`              | (empty)                                   | Enables the OpenAI provider.                                   |
| `anthropicApiKey`           | (empty)                                   | Enables the Anthropic provider.                                |
| `geminiApiKey`              | (empty)                                   | Enables the Gemini provider.                                   |
| `otherBaseUrl`              | (empty)                                   | Base URL for the OpenAI-compatible provider.                   |
| `otherApiKey`               | (empty)                                   | Key for the OpenAI-compatible provider.                        |
| `systemPrompt`              | Pagenova grounding prompt (see below)      | Prepended to every request. Local Ollama uses a shorter variant of the default to conserve its context window; a prompt you edit is used verbatim. |
| `embeddingBackend`          | `browser`                                 | `browser` (Transformers.js) or `ollama`.                       |
| `ollamaEmbeddingModel`      | `nomic-embed-text`                        | Embedding model when `embeddingBackend` is `ollama`.           |
| `imageMaxEdge`              | `1568`                                    | Longest edge (px) before an image is downscaled.               |
| `imageQuality`              | `0.8`                                     | JPEG quality when re-encoding images.                          |
| `alwaysCompress`            | `false`                                   | Re-encode images even when under `imageMaxEdge`.               |
| `webSearchProvider`         | `duckduckgo`                              | `duckduckgo` or `tavily`.                                      |
| `tavilyApiKey`              | (empty)                                   | Enables Tavily full search; otherwise DuckDuckGo is used.      |

"Clear stored data" wipes local and session storage, the RAG index, **and**
chat history.

Every request is prefixed with a generated `[SESSION]` header that tells the
model its grounding mode (`FULL CONTEXT (complete)` or
`RETRIEVED EXCERPTS (partial)`), the source titles, whether vision is
supported, whether web search ran, and the current date. This makes the mode
explicit instead of leaving the model to infer it from the context shape.

### System prompt

The default prompt is the Pagenova grounding prompt in `lib/prompt.ts`. It
encodes the behaviors the extension's design depends on:

- **Grounding**: prefer supplied page/document context over prior knowledge,
  distinguish "the page states X" from "generally, X", and never claim absence
  of content in `RETRIEVED EXCERPTS` mode.
- **Untrusted content**: page text, documents, images, and search results are
  data, not instructions; injected "ignore previous instructions" prompts are
  ignored.
- **Vision**: describe only what is visible, mark illegible text, never guess
  at numbers or identifiers.
- **Formatting**: Markdown tuned for a panel as narrow as 400px: short
  paragraphs, level-4 headings, fenced code with language tags, no em dashes.
- **Safety**: never ask for credentials, refuse harmful requests briefly, and
  don't claim capabilities the extension lacks (it can't click, scroll, or run
  code).

Prompt selection in `resolveSystemPrompt()`:

| Provider | Default prompt |
| -------- | -------------- |
| Cloud (OpenAI, Anthropic, Gemini, other) | Full grounding prompt (~1,100 tokens) |
| `ollama` | Trimmed variant (~300 tokens: core behavior + grounding + untrusted content + formatting) |

The trimmed variant ships for Ollama so the instructions don't compete with
page context for a small model's context window. A prompt you edit in Settings
is used **verbatim** for every provider. The legacy one-liner placeholder is
treated as unset and migrates to the full prompt on read, so installs from an
older build pick up the new default without touching their other settings.

For Anthropic, the system prompt is marked as an ephemeral cache prefix. Page
and document content stays in the user turn so it remains untrusted data rather
than acquiring system-level authority.

---

## Architecture

### High-level flow

```
┌───────────────────────────── UI (React) ─────────────────────────────┐
│  sidepanel / webui (ChatPanel.tsx)   options (App.tsx)   help        │
│        │                                    │                        │
│        │ chrome.runtime.connect('chat')     │ local settings + session keys │
└────────┼────────────────────────────────────┼────────────────────────┘
         ▼                                    ▼
┌──────────────────────── Background service worker ───────────────┐
│  ports.ts (streaming, model pull)  router.ts (CHAT_REQUEST routing)  │
│  screenshot.ts (captureVisibleTab)  index.ts (menus, side panel)     │
│  imageUrl.ts (SSRF-validated fetch)  extract.ts (on-demand injection)│
│        │                                    │                        │
│        │  chrome.scripting.executeScript     │  prepareContext()      │
└────────┼────────────────────────────────────┼────────────────────────┘
         ▼                                    ▼
┌── Page text / images ──┐        ┌──────────── RAG pipeline ─────────┐
│ (injected on demand)   │        │ chunk.ts → embed.ts → vectorStore │
│ text + top-9 images    │        │            → retrieve.ts          │
└────────────────────────┘        └───────┬──────────────┬────────────┘
                                           ▼              ▼
                                 ┌── Offscreen doc ──┐   Ollama /api/embeddings
                                 │ Transformers.js   │   (when backend=ollama)
                                 │ all-MiniLM-L6-v2  │
                                 └───────────────────┘
                                           │
                         ┌─────────────────▼─────────────────┐
                         │ Providers: ollama / openai /      │
                         │ anthropic / gemini / openaiCompat │
                         └───────────────────────────────────┘
                                           │
                         ┌─────────────────▼─────────────────┐
                         │ Storage: local settings · session keys │
                         │ IndexedDB (history and RAG)         │
                         │ (pagenova-history, pagenova-rag)   │
                         └───────────────────────────────────┘
```

### Component breakdown

**UI layer** (`React` + `react-markdown` + `rehype-highlight`)

- `sidepanel/` and `webui/` both render the same `ChatPanel.tsx`; the only
  difference is a full-tab wrapper and an expand/collapse switch.
- `ChatPanel.tsx` is composition + layout only. Session state lives in
  `useChatSession.ts` (messages, provider/model selection, tab selection,
  streaming state, port lifecycle, history overlay) and attachments in
  `useAttachments.ts` (images, docs, page images, screenshot). It talks to the
  background worker exclusively over a port named `chat`.
- `options/App.tsx` is the settings page; `help/App.tsx` is the in-app setup
  guide.

**Background service worker** (the extension's single source of truth for
providers and RAG)

- `index.ts`: entry point: configures the side panel, registers context menus
  ("Summarize with AI", "Ask AI about this image"), handles
  `CAPTURE_SCREENSHOT` / `FETCH_PAGE_IMAGES`, and wires tab-close/navigation
  invalidation of the RAG index.
- `router.ts`: `routeChatRequest()`: resolves settings → provider, gathers tab
  text and docs, calls `prepareContext()`, optionally runs web search, builds the
  message list (system prompt + history + current turn), and streams the
  response.
- `ports.ts`: manages a `Map<portId, AbortController>`; `STOP_GENERATION`
  aborts the in-flight controller, and `onDisconnect` cleans it up.
- `screenshot.ts`: `captureVisibleTab` wrapper.
- `imageUrl.ts`: `imageUrlToDataUrl()` accepts bounded HTTPS image responses,
  validates every redirect, and blocks private-host ranges before fetching.

**On-demand page extraction** (`background/extract.ts`): injected functions
strip `script/style/noscript/nav/footer/aside/iframe/svg`, collapse whitespace,
and cap page text at 250,000 characters. They also collect prominent
`<img>`/`<canvas>` elements (at least 50×50px, top 9 by area) and can read the
current text selection when you send a question.

**RAG pipeline**: see [RAG internals](#rag-internals).

**Offscreen document**: `offscreen/main.ts` hosts the `Transformers.js`
feature-extraction pipeline so the WASM runtime survives service-worker idle
(an MV3 constraint). It answers `EMBED_TEXTS` and signals readiness with
`OFFSCREEN_READY`.

**Providers**: `lib/providers/*` implement a common `LLMProvider` interface
(`listModels()` + an async-generator `chatStream()`). Each provider ships its own
stream parser:

- Ollama: NDJSON (`/api/chat`).
- OpenAI / compatible: SSE (`/v1/chat/completions`).
- Anthropic: SSE (`/v1/messages`), with ephemeral prompt caching and per-model
  `max_tokens`.
- Gemini: SSE (`:streamGenerateContent`).

### Message protocol

The side panel ↔ background channel is a typed contract in `lib/messaging.ts`.
The chat flow:

| Direction          | Message            | Payload                                                    |
| ------------------ | ------------------ | ---------------------------------------------------------- |
| panel → background | `CHAT_REQUEST`     | `text`, `provider`, `model`, `tabIds`, `images`, `docs`, `history`, `webSearch` |
| panel → background | `STOP_GENERATION`  | -                                                          |
| background → panel | `CONTEXT_INFO`     | `mode` (`full`/`retrieval`), `sources[]`                   |
| background → panel | `CHAT_CHUNK`       | `delta` (one token/segment)                                |
| background → panel | `CHAT_DONE`        | -                                                          |
| background → panel | `CHAT_ERROR`       | `error`                                                    |

Separate ports/channels exist for model pull (`pull`) and screenshot / page-image
requests (one-shot `runtime.sendMessage`).

### RAG internals

`lib/rag/retrieve.ts` is budget-aware. For a request:

1. **Budget check**: total tokens of all sources + question are estimated
   (`chars/4` for ASCII, ~1 token per CJK char) and compared against the model's known context window
   (`CONTEXT_WINDOWS` table, with sane fallbacks). If it's under ~60% of the
   window, content is injected **full** and no embedding happens.
2. **Index** (only when over budget): tabs are keyed `tab:<id>`, documents
   `doc:<name>`. Each source is chunked (target 400 tokens, 50-token overlap),
   embedded, and stored in IndexedDB (`pagenova-rag`). A SHA-256 content hash in
   `chrome.storage.local` (`chunk-hash-<sourceId>`) makes re-indexing a no-op
   when content is unchanged and forces re-indexing when it isn't.
3. **Retrieve**: the question is embedded, compared against stored chunk
   vectors with cosine similarity (`topK`, k=6), and the best chunks are returned
   as `Retrieved excerpts from N sources`.
4. **Fallback**: if embedding throws, the pipeline degrades to a truncated
   full-text prompt sized against the real model window instead of a fixed cap.

IndexedDB layout:

- `pagenova-rag`: object stores `chunks` (keyed `id`, indexed `sourceId`) and
  `tabMeta`.
- `pagenova-history`: object store `sessions` (keyed auto-increment `id`,
  indexed `conversationId`) for one-row-per-conversation history.

---

## Providers

| Provider          | Vision detection                          | Notes                                        |
| ----------------- | ----------------------------------------- | -------------------------------------------- |
| `ollama`          | `/api/show` capability metadata, then a conservative known-model fallback | Local; no key.               |
| `openai`          | `gpt-4o`, `gpt-4.1`, `o1`, `o3`, `o4`     | Filters out embedding/whisper/tts/etc. models. |
| `anthropic`       | any `claude`                              | Per-model `max_tokens`; ephemeral caching.    |
| `gemini`          | any `gemini`                              | Filters embedding/aqa/imagen/veo models.      |
| `other`           | `vision`, `vl`, `gpt-4o`, `qwen`, `llava` | OpenAI-compatible base URL + key.             |

Anthropic `max_tokens` is set per model because Anthropic rejects requests above
a model's ceiling: `claude-sonnet-4`/`claude-haiku-4`/`claude-3-7` → 64000,
`claude-opus-4` → 32000, `claude-3-5` → 8192, `claude-3-opus`/`claude-3-haiku` →
4096, default 8192.

---

## Security & privacy

See [PRIVACY.md](PRIVACY.md) for the full policy. Highlights:

- **API keys** live only in `chrome.storage.session` and are sent only to the
  provider you select. They clear when Chrome restarts. No analytics,
  telemetry, or tracking.
- **Web search** sends your question to DuckDuckGo or Tavily only when the
  toggle is on, including when you use a local Ollama model.
- **`http://*/*` + `https://*/*`** host permission exists because the extension
  grounds answers in any tab you select and fetches right-clicked images from
  any site. Page text and images are read **on demand only**; there is no
  persistent content script, and content leaves your machine only when you send
  a message that references it.
- **Optional screenshot access** is requested only when you click Screenshot.
  If you allow it, Pagenova can capture the active normal webpage after you
  switch tabs while the side panel remains open. It does not capture tabs
  automatically.
- **On-device embeddings** run locally via `Transformers.js` (or your own Ollama
  server) and never leave the machine.
- The right-click image path accepts only bounded HTTPS image responses,
  validates redirects, and blocks private/loopback/link-local hosts (including
  IPv6) before fetching.

## Project structure

```
browser-ai-assistant/
├── manifest.json             MV3 manifest (permissions, side panel, CSP)
├── package.json              deps + scripts
├── vite.config.ts            CRXJS + React build config
├── vitest.config.ts          Vitest config (node env, fake-indexeddb setup)
├── tsconfig*.json            app + node project references
├── index.html                dev entry
├── sidepanel.html            side panel host
├── webui.html                full-tab host
├── options.html              settings host
├── help.html                 in-app guide host
├── offscreen.html            embedding worker host
├── README.md / CONTRIBUTING.md / PRIVACY.md / DESIGN.md
├── LICENSE                   MIT license
├── .github/workflows/ci.yml  lint + test + build on push/PR
├── scripts/fix-loader.js     post-build service-worker fixup
└── src/
    ├── background/           service worker, ports, router, screenshot, imageUrl, extract
    ├── lib/
    │   ├── providers/        ollama, openai, anthropic, gemini, openaiCompatible, registry, types
    │   ├── rag/              chunk, embed, vectorStore, retrieve, documents, types
    │   ├── images/           encode.ts (resize/compress)
    │   ├── storage/          credentials.ts (session-only keys), history.ts (IndexedDB sessions)
    │   ├── web/              search.ts (DuckDuckGo / Tavily)
    │   ├── prompt.ts         system prompt + [SESSION] header
    │   └── messaging.ts      typed message contracts
    ├── sidepanel/            main.tsx, App.tsx, ChatPanel.tsx, useChatSession.ts, useAttachments.ts
    ├── webui/                main.tsx, App.tsx
    ├── options/              main.tsx, App.tsx
    ├── help/                 main.tsx, App.tsx
    ├── offscreen/            main.ts (Transformers.js embedding host)
    └── test/                 setup.ts (fake-indexeddb)
```

---

## Development

### Scripts

| Script            | Command                                                    |
| ----------------- | ---------------------------------------------------------- |
| dev               | `vite`                                                     |
| build             | type-check, build, fix worker loader, verify `dist/`        |
| verify:dist       | check required extension files and background entry          |
| test              | `vitest run`                                               |
| lint              | `oxlint`                                                   |
| preview           | `vite preview`                                             |

### CI

`.github/workflows/ci.yml` runs a production-dependency audit, `lint`, `test`,
and `build` on push and pull requests, so the checks in this document are
enforced rather than assumed.

### Tests

```bash
npm test
```

121 tests across 22 files, covering:

- **RAG**: chunking (size bounds + overlap), cosine similarity (identity,
  orthogonal, dimension-mismatch skip), CJK-aware token estimation, retrieval
  mode selection, aggregate-cap truncation flagging, and content-hash cache
  validation (same doc = cache hit, changed doc = re-embed).
- **Retrieval eval**: a fixed corpus of 24 question/answer-passage pairs across
  4 documents, asserting the real `chunkText` (400-token chunks, 50-token
  overlap) plus `topK`/`cosineSim` (k=6) achieve full recall@6. The embedding
  model is swapped for a deterministic lexical stand-in, so the eval runs
  offline and pins the retrieval *parameters*, not the embedder.
- **Providers**: Ollama/OpenAI/Anthropic/Gemini stream parsers, malformed-chunk
  resilience, and Anthropic `max_tokens` selection.
- **Prompt**: `[SESSION]` header generation (mode, sources, vision, web search,
  truncation) and `resolveSystemPrompt` (cloud vs. Ollama default, custom prompt
  verbatim, legacy-placeholder migration).
- **Assembly**: `assembleMessages` ordering (cached system prompt first, then
  history and the current turn's context, header, question, and images).
- **History**: persist/list/delete, newest-first ordering, and the
  save → reload → continue flow (one row per conversation).
- **Abort**: `STOP_GENERATION` aborts the registered controller and clears the
  map.
- **Attachment boundaries**: document-size rejection and bounded HTTPS image
  fetches that reject private URLs, invalid content types, and unsafe redirects.
- **UI**: `ChatPanel` renders its empty state, input, and controls against a
  mocked `chrome`, plus `renderHook` coverage of the `useChatSession` streaming
  races: new-chat mid-stream (no phantom message leak), stop mid-stream (late
  chunks dropped), and history reopen (transient state reset).
- **Web search**: the globe toggle enables search for every provider.
- **Embedding retry**: the browser backend retries once after an offscreen
  failure.

Tests use `fake-indexeddb` so IndexedDB-backed modules run in Node, and the
`pdfjs-dist` parser's missing `DOMMatrix` is stubbed in `test/setup.ts`. UI tests
(`*.test.tsx`) run under jsdom via a named `projects` entry in `vitest.config.ts`,
so the jsdom opt-in is structural rather than a per-file pragma.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, and pull-request
guidance. The project uses the [MIT License](LICENSE).

---

## Manual QA matrix

| Area | Case | Expect |
|------|------|--------|
| Ollama | `Test` with Ollama running | `ollama connection OK ✓` |
| Ollama | `Test` with Ollama stopped | Unreachable hint with CORS command |
| Ollama | Pull a model | Progress bar → "Model pulled ✓" |
| Ollama | Pull with CORS misconfigured | Inline 403 CORS explanation |
| Provider | Each cloud key saved | Provider appears in dropdown |
| Provider | No key saved | Provider hidden |
| Chat | Text-only, Ollama | Streams, no error |
| Chat | Follow-up question | Model has prior context |
| Chat | Stop mid-stream | Generation halts |
| Chat | New chat mid-stream | No phantom message leaks in |
| Chat | Attach image + non-vision model | Vision warning shown |
| Chat | Attach image + vision model | Grounded answer |
| Context | Select 1+ tabs | "full page context (N sources)" |
| Context | First use of Add context | Consent appears before open-tab titles or URLs are read |
| Context | Tab opened before reload | Injection fallback still extracts |
| Context | Long page → retrieval | "Retrieved excerpts from N sources" |
| Documents | PDF / DOCX / CSV / TXT upload | Parsed and used in answer |
| Documents | Re-upload same name, new content | Re-indexed, not stale |
| Documents | Legacy `.doc` | Unsupported-type message |
| Images | Paste, drag-drop, file picker | Thumbnails attach |
| Images | Camera / screenshot | Screenshot attaches |
| Images | Right-click image | Side panel opens with image |
| History | Save, reload, reopen | One session per conversation |
| History | Load session → New chat | State clears |
| History | Export Markdown | Downloads self-contained `.md` |
| Input | Enter | Sends message |
| Input | Shift+Enter | New line |
| UI | Theme toggle | Dark/light persists |
| UI | Plus menu | Opens up, closes on outside click |
| UI | Expand / collapse | Context tab preserved |
| Settings | Clear stored data | Settings, session keys, history, and index all wiped |
| Prompt | Edit system prompt | Used verbatim for every provider, no trimming |
| Prompt | Upgrade from older build (legacy one-liner stored) | Migrates to the full prompt without touching other settings |
| Context | Select many very long tabs | "Truncated to fit (N sources)" pill, header marks content omitted |

---

## Troubleshooting

- **Ollama returns 403 on pull or embeddings**: CORS is misconfigured. Copy
  the exact `OLLAMA_ORIGINS` command from Pagenova Settings, then restart
  Ollama (see [Ollama setup](#ollama-local-models)).
- **"Could not load Ollama models"**: Ollama isn't running, or the extension
  can't reach `http://localhost:11434`. Start Ollama and refresh.
- **Cloud provider 401**: the key is wrong, or (for "Other") the HTTPS base URL
  is empty/incorrect. Re-check Settings.
- **Long answer cuts off mid-sentence (Anthropic)**: the model hit its
  per-model `max_tokens`. This is intentional (Anthropic requires an explicit
  cap) but a ceiling; see [Providers](#providers).
- **Retrieval answers seem off after switching embedding backend**: stale chunks
  from the old backend have a different dimension. Re-upload documents or
  **Clear stored data**.
- **Side panel won't open**: requires Chrome 116+. Verify the extension is
  reloaded and re-pin it.

---

## Roadmap

### Next up
- **OCR fallback**: feed text-heavy images (screenshots, receipts) to non-vision
  models via in-browser OCR.

### Later
- **Provider comparison mode**: same prompt/image to two providers side-by-side.
- **MCP compatibility**: connect Pagenova to Model Context Protocol servers
  for optional tools and external context.
- **Voice input**: Web Speech API for dictating questions.
- **PDF page-render-as-image**: offer page renders as vision attachments for
  scanned/figure-heavy docs.
- **Per-model context probing**: detect a model's true context window and warn
  before injecting too much page text.
- **HNSW / better vector index**: swap brute-force cosine if retrieval grows
  past a few thousand chunks.

---

## License

MIT. See [LICENSE](LICENSE).
