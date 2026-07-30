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

type SessionResponse = {
  visitorToken: string;
  conversationId: string;
  messages: WidgetMessage[];
  agentsOnline: number;
  agentLastReadAt: string | null;
};

type KbSearchResult = {
  workspaceSlug: string;
  articles: { id: string; title: string }[];
};

const KB_SEARCH_DEBOUNCE_MS = 300;
// Kept in sync with src/lib/presence.ts -- duplicated rather than imported
// because this bundle is deliberately standalone (no app imports, so it can
// be dropped on any third-party page).
const HEARTBEAT_INTERVAL_MS = 30_000;
const TYPING_TTL_MS = 4_000;
const TYPING_THROTTLE_MS = 1_500;

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
        header { background: #111827; color: #fff; padding: 12px 16px; }
        header .title { font-size: 14px; font-weight: 600; }
        header .status { display: flex; align-items: center; gap: 6px; font-size: 11px; opacity: 0.85; margin-top: 2px; }
        header .dot { width: 7px; height: 7px; border-radius: 999px; background: #6b7280; }
        header .dot.online { background: #22c55e; }
        #messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
        .msg { max-width: 85%; padding: 8px 10px; border-radius: 8px; font-size: 13px; line-height: 1.4; word-wrap: break-word; }
        .msg-contact { align-self: flex-end; background: #111827; color: #fff; }
        .msg-agent, .msg-ai, .msg-system { align-self: flex-start; background: #f3f4f6; color: #111827; }
        .receipt { align-self: flex-end; font-size: 10px; color: #6b7280; margin-top: -4px; }
        #typing { align-self: flex-start; font-size: 11px; color: #6b7280; font-style: italic; }
        #typing[hidden] { display: none; }
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
        <header>
          <div class="title">Chat with us</div>
          <div class="status"><span class="dot" id="status-dot"></span><span id="status-text">Connecting...</span></div>
        </header>
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
    const statusDot = shadow.getElementById("status-dot") as HTMLSpanElement;
    const statusText = shadow.getElementById("status-text") as HTMLSpanElement;

    const tokenStorageKey = `ic-widget-token-${workspaceId}`;
    let visitorToken: string | undefined = localStorage.getItem(tokenStorageKey) ?? undefined;
    let conversationId: string | null = null;
    let messages: WidgetMessage[] = [];
    const seenMessageIds = new Set<string>();
    let agentLastReadAt: number | null = null;
    let agentTypingTimer: ReturnType<typeof setTimeout> | undefined;
    let lastTypingSentAt = 0;

    // ---- rendering -------------------------------------------------------

    function renderMessages() {
      messagesEl.replaceChildren();

      // The receipt hangs off the last message the visitor sent, not every
      // one: "seen" is a watermark, and repeating it under each bubble is
      // noise. Anything the agent has read is by definition older than that.
      const lastOwnIndex = messages.map((m) => m.senderType).lastIndexOf("contact");

      messages.forEach((message, index) => {
        const item = document.createElement("div");
        item.className = `msg msg-${message.senderType}`;
        // textContent, never innerHTML: message bodies are untrusted (they
        // include whatever an agent typed) and this widget runs on the
        // customer's own page.
        item.textContent = message.body;
        messagesEl.appendChild(item);

        if (index === lastOwnIndex && agentLastReadAt !== null) {
          const sentAt = Date.parse(message.createdAt);
          if (!Number.isNaN(sentAt) && agentLastReadAt >= sentAt) {
            const receipt = document.createElement("div");
            receipt.className = "receipt";
            receipt.textContent = "Seen";
            messagesEl.appendChild(receipt);
          }
        }
      });

      const typing = document.createElement("div");
      typing.id = "typing";
      typing.textContent = "Agent is typing...";
      typing.hidden = !agentTypingTimer;
      messagesEl.appendChild(typing);

      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addMessage(message: WidgetMessage) {
      if (seenMessageIds.has(message.id)) return;
      seenMessageIds.add(message.id);
      messages.push(message);
      renderMessages();
    }

    function setAgentsOnline(count: number) {
      const online = count > 0;
      statusDot.classList.toggle("online", online);
      statusText.textContent = online
        ? `We're online${count > 1 ? ` (${count})` : ""}`
        : "We're away -- leave a message";
    }

    // ---- transport -------------------------------------------------------

    function postEvent(type: "typing" | "read" | "heartbeat"): Promise<Response | null> {
      if (!conversationId || !visitorToken) return Promise.resolve(null);
      return fetch(`${origin}/api/widget/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, visitorToken, type }),
        // Signals are advisory; a failed one is re-sent by the next keystroke,
        // the next heartbeat, or the next message. Never surfaced to the user.
      }).catch(() => null);
    }

    function markRead() {
      if (panel.hidden) return;
      postEvent("read");
    }

    async function heartbeat() {
      // Only while the panel is open: a visitor with the bubble collapsed
      // isn't "in" the conversation, and beating anyway would show agents a
      // green dot for someone who's long gone.
      if (panel.hidden || document.visibilityState !== "visible") return;
      const res = await postEvent("heartbeat");
      if (!res || !res.ok) return;
      const data: { agentsOnline?: number } = await res.json().catch(() => ({}));
      if (typeof data.agentsOnline === "number") setAgentsOnline(data.agentsOnline);
    }

    function showAgentTyping() {
      if (agentTypingTimer) clearTimeout(agentTypingTimer);
      agentTypingTimer = setTimeout(() => {
        agentTypingTimer = undefined;
        renderMessages();
      }, TYPING_TTL_MS);
      renderMessages();
    }

    function subscribeToConversation(id: string) {
      const pusher = new Pusher(__PUSHER_KEY__, { cluster: __PUSHER_CLUSTER__ });
      const channel = pusher.subscribe(`conversation-${id}`);

      channel.bind("new-message", (message: WidgetMessage) => {
        addMessage(message);
        // An agent reply landing while the panel is open is read on arrival --
        // that's what makes the dashboard's own receipt meaningful.
        if (message.senderType !== "contact") markRead();
      });

      channel.bind("typing", (event: { side: string }) => {
        if (event.side === "agent") showAgentTyping();
      });

      channel.bind("read", (event: { side: string; at: string }) => {
        if (event.side !== "agent") return;
        const at = Date.parse(event.at);
        // Keep the later watermark: events can arrive out of order, and a
        // stale one must never walk "Seen" back off a message.
        if (!Number.isNaN(at) && (agentLastReadAt === null || at > agentLastReadAt)) {
          agentLastReadAt = at;
          renderMessages();
        }
      });
    }

    async function startSession() {
      try {
        const res = await fetch(`${origin}/api/widget/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, visitorToken }),
        });
        if (!res.ok) throw new Error(`session request failed: ${res.status}`);
        const data: SessionResponse = await res.json();
        visitorToken = data.visitorToken;
        conversationId = data.conversationId;
        localStorage.setItem(tokenStorageKey, visitorToken);

        // Restores the thread across reloads and return visits: the token in
        // localStorage identifies the visitor, and the server hands back that
        // conversation's backlog.
        messages = [];
        seenMessageIds.clear();
        for (const message of data.messages ?? []) {
          seenMessageIds.add(message.id);
          messages.push(message);
        }
        agentLastReadAt = data.agentLastReadAt ? Date.parse(data.agentLastReadAt) : null;
        renderMessages();
        setAgentsOnline(data.agentsOnline ?? 0);

        subscribeToConversation(conversationId);
      } catch (err) {
        console.error("[widget] failed to start session", err);
        statusText.textContent = "Can't reach support right now";
      }
    }

    // ---- interaction -----------------------------------------------------

    bubble.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        markRead();
        heartbeat();
        input.focus();
      }
    });

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
        addMessage(message);
      } catch (err) {
        console.error("[widget] failed to send message", err);
      }
    });

    function hideSuggestions() {
      suggestionsEl.hidden = true;
      suggestionsEl.replaceChildren();
    }

    function renderSuggestions(result: KbSearchResult) {
      if (result.articles.length === 0) {
        hideSuggestions();
        return;
      }
      suggestionsEl.replaceChildren();
      const label = document.createElement("div");
      label.className = "suggestions-label";
      label.textContent = "Suggested articles";
      suggestionsEl.appendChild(label);

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

      // Throttled rather than debounced: the agent should see "typing" while
      // the visitor is still going, not once they pause.
      if (query && Date.now() - lastTypingSentAt > TYPING_THROTTLE_MS) {
        lastTypingSentAt = Date.now();
        postEvent("typing");
      }

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

    setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", heartbeat);

    startSession();
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
