# Pagenova privacy policy

**Effective date:** August 2026

Pagenova is a browser extension that answers questions with AI models. You can
optionally include tabs, documents, and images as context. This policy explains
what the extension stores, reads, and sends.

## Data stored locally

- Settings are stored in your browser's `chrome.storage.local`. API keys are
  stored only in `chrome.storage.session`, which Chrome clears when the browser
  restarts. They stay on your device except when an API key is sent to the
  provider you selected.
- Chat history and document or tab index data are stored in IndexedDB
  (`pagenova-history`, `pagenova-rag`) on your device.
- After you allow Page Context, Pagenova reads open-tab titles and URLs in
  memory to show the tab picker. It does not store or send them as browsing
  history.
- The optional in-browser embedding model downloads from Hugging Face on first
  use and is cached locally. Text used to make embeddings stays on your device.
- "Clear stored data" in Settings removes this local data.

## Data sent to third parties

Pagenova sends data outside your device only when you start an action that uses
an external service:

- Your prompt, along with any page text, document, or image you select or
  attach, is sent to the AI provider you choose: a local Ollama server, OpenAI,
  Anthropic, Google Gemini, or an OpenAI-compatible endpoint you configure. To
  support follow-up questions about an image, Pagenova may send the most recent
  image attachment again within the same conversation.
- If you turn on web search, Pagenova sends your question to DuckDuckGo or
  Tavily. For a follow-up such as "search it," it also sends up to two recent
  user questions so the search provider can identify the subject. This applies
  to a local Ollama model too.

Pagenova does not sell user data, use it for advertising, or give people access
to it. It uses page content only to provide the context feature you selected,
consistent with the Chrome Web Store User Data Policy's Limited Use
requirements.

## What Pagenova does not collect

- Pagenova does not collect analytics, telemetry, crash reports, or tracking data.
- It does not collect account, identity, or browsing-history data beyond the
  open-tab titles and URLs described above.
- It does not send page text or images unless you select a tab as context,
  highlight text and send a question, or attach an image.

## Permissions

Pagenova requests host access for `http://*/*` and `https://*/*` so it can
ground an answer in any tab you choose and fetch images you right-click or add
from the current page. It reads page text and images on demand. The extension
does not run a persistent content script on every page. It injects an extraction
function only after you select a tab as context or send a question with a page
selection, then discards it. Pagenova
uses host access to the selected AI provider or local Ollama server only to
make the request you initiated.

When you click Screenshot, Pagenova may ask for optional all-sites screenshot
access. If you allow it, the extension can capture the currently active normal
webpage after you switch tabs while the side panel stays open. It never captures
tabs automatically, and it sends a screenshot to a provider only when you
attach it and send a message.

These permissions are used solely for the features described above.

## Contact

For questions about this policy, open an issue in the project repository.
