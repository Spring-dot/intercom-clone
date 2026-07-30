import Pusher from "pusher-js";

// Injected at build time by widget/build.js (this file is bundled standalone
// by esbuild, outside Next's own env handling -- see that script for how
// these get substituted).
declare const __PUSHER_KEY__: string;
declare const __PUSHER_CLUSTER__: string;

type WidgetMessage = {
  id: string;
  senderType: string;
  body: string;
  createdAt: string;
};

type KbSearchResult = {
  workspaceSlug: string;
  articles: { id: string; title: string }[];
};

const KB_SEARCH_DEBOUNCE_MS = 300;

const HOST_ELEMENT_ID = "ic-widget-host";

(function boot() {
  // Must run synchronously at the top of the script's initial execution --
  // `document.currentScript` is only valid during that window, not inside a
  // later callback (e.g. a deferred DOMContentLoaded handler).
  const scriptEl = document.currentScript as HTMLScriptElement | null;
  const workspaceId = scriptEl?.dataset.workspaceId;
  const origin = scriptEl?.src ? new URL(scriptEl.src, window.location.href).origin : window.location.origin;

  function init() {
    if (!workspaceId) {
      console.error("[widget] missing data-workspace-id on the widget <script> tag");
      return;
    }
    if (document.getElementById(HOST_ELEMENT_ID)) return;

    const hostEl = document.createElement("div");
    hostEl.id = HOST_ELEMENT_ID;
    document.body.appendChild(hostEl);
    const shadow = hostEl.attachShadow({ mode: "open" });

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: system-ui, sans-serif; }
        #bubble {
          position: fixed; bottom: 20px; right: 20px; width: 56px; height: 56px;
          border-radius: 999px; border: none; background: #111827; color: #fff;
          font-size: 24px; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.25);
          z-index: 2147483000;
        }
        #panel {
          position: fixed; bottom: 88px; right: 20px; width: 320px; height: 440px;
          background: #fff; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.2);
          display: flex; flex-direction: column; overflow: hidden; z-index: 2147483000;
        }
        #panel[hidden] { display: none; }
        header { background: #111827; color: #fff; padding: 12px 16px; font-size: 14px; font-weight: 600; }
        #messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
        .msg { max-width: 85%; padding: 8px 10px; border-radius: 8px; font-size: 13px; line-height: 1.4; word-wrap: break-word; }
        .msg-contact { align-self: flex-end; background: #111827; color: #fff; }
        .msg-agent, .msg-ai, .msg-system { align-self: flex-start; background: #f3f4f6; color: #111827; }
        #composer { display: flex; flex-direction: column; border-top: 1px solid #e5e7eb; }
        #suggestions { display: flex; flex-direction: column; border-bottom: 1px solid #e5e7eb; }
        #suggestions[hidden] { display: none; }
        #suggestions button {
          all: unset; cursor: pointer; padding: 8px 12px; font-size: 12px; color: #111827;
          border-bottom: 1px solid #f3f4f6;
        }
        #suggestions button:hover { background: #f9fafb; }
        #suggestions .suggestions-label { padding: 6px 12px 0; font-size: 11px; color: #6b7280; text-transform: uppercase; }
        #composer-row { display: flex; }
        #input { flex: 1; border: none; padding: 10px 12px; font-size: 13px; outline: none; }
        #composer-row button { border: none; background: #111827; color: #fff; padding: 0 16px; font-size: 13px; cursor: pointer; }
      </style>
      <button id="bubble" aria-label="Open chat">💬</button>
      <div id="panel" hidden>
        <header>Chat with us</header>
        <div id="messages"></div>
        <div id="suggestions" hidden></div>
        <form id="composer">
          <div id="composer-row">
            <input id="input" type="text" placeholder="Type a message..." autocomplete="off" />
            <button type="submit">Send</button>
          </div>
        </form>
      </div>
    `;

    const bubble = shadow.getElementById("bubble") as HTMLButtonElement;
    const panel = shadow.getElementById("panel") as HTMLDivElement;
    const messagesEl = shadow.getElementById("messages") as HTMLDivElement;
    const suggestionsEl = shadow.getElementById("suggestions") as HTMLDivElement;
    const composer = shadow.getElementById("composer") as HTMLFormElement;
    const input = shadow.getElementById("input") as HTMLInputElement;

    bubble.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
    });

    const tokenStorageKey = `ic-widget-token-${workspaceId}`;
    let visitorToken: string | undefined = localStorage.getItem(tokenStorageKey) ?? undefined;
    let conversationId: string | null = null;
    const seenMessageIds = new Set<string>();

    function appendMessage(message: WidgetMessage) {
      if (seenMessageIds.has(message.id)) return;
      seenMessageIds.add(message.id);
      const item = document.createElement("div");
      item.className = `msg msg-${message.senderType}`;
      item.textContent = message.body;
      messagesEl.appendChild(item);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function subscribeToConversation(id: string) {
      const pusher = new Pusher(__PUSHER_KEY__, { cluster: __PUSHER_CLUSTER__ });
      const channel = pusher.subscribe(`conversation-${id}`);
      channel.bind("new-message", appendMessage);
    }

    async function startSession() {
      try {
        const res = await fetch(`${origin}/api/widget/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, visitorToken }),
        });
        if (!res.ok) throw new Error(`session request failed: ${res.status}`);
        const data: { visitorToken: string; conversationId: string } = await res.json();
        visitorToken = data.visitorToken;
        conversationId = data.conversationId;
        localStorage.setItem(tokenStorageKey, visitorToken);
        subscribeToConversation(conversationId);
      } catch (err) {
        console.error("[widget] failed to start session", err);
      }
    }

    composer.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text || !conversationId || !visitorToken) return;
      input.value = "";
      hideSuggestions();
      try {
        const res = await fetch(`${origin}/api/widget/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, visitorToken, body: text }),
        });
        if (!res.ok) throw new Error(`send failed: ${res.status}`);
        const message: WidgetMessage = await res.json();
        appendMessage(message);
      } catch (err) {
        console.error("[widget] failed to send message", err);
      }
    });

    function hideSuggestions() {
      suggestionsEl.hidden = true;
      suggestionsEl.innerHTML = "";
    }

    function renderSuggestions(result: KbSearchResult) {
      if (result.articles.length === 0) {
        hideSuggestions();
        return;
      }
      suggestionsEl.innerHTML = `<div class="suggestions-label">Suggested articles</div>`;
      for (const article of result.articles.slice(0, 3)) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = article.title;
        button.addEventListener("click", () => {
          window.open(`${origin}/help-center/${result.workspaceSlug}/${article.id}`, "_blank", "noopener");
        });
        suggestionsEl.appendChild(button);
      }
      suggestionsEl.hidden = false;
    }

    let kbSearchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
    let kbSearchRequestId = 0;

    input.addEventListener("input", () => {
      const query = input.value.trim();
      if (kbSearchDebounceTimer) clearTimeout(kbSearchDebounceTimer);

      if (!query) {
        hideSuggestions();
        return;
      }

      kbSearchDebounceTimer = setTimeout(async () => {
        const requestId = ++kbSearchRequestId;
        try {
          const res = await fetch(
            `${origin}/api/kb-search?workspaceId=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(query)}`
          );
          if (!res.ok) throw new Error(`kb-search failed: ${res.status}`);
          const result: KbSearchResult = await res.json();
          // Ignore stale responses if a newer keystroke already fired
          // another request while this one was in flight.
          if (requestId !== kbSearchRequestId) return;
          renderSuggestions(result);
        } catch (err) {
          console.error("[widget] kb-search failed", err);
        }
      }, KB_SEARCH_DEBOUNCE_MS);
    });

    startSession();
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
