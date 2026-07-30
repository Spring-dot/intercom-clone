# Intercom Clone

A multi-tenant customer support platform: a unified inbox for chat and email
conversations, an embeddable real-time chat widget (with typing indicators,
online/offline presence, read receipts, and history that survives a reload),
team invitations with admin/agent roles, a public knowledge base served on
your own domain, and AI-generated conversation summaries. Every workspace is
isolated by `workspaceId` at the query level -- no route trusts a
client-supplied tenant identifier.

## Try it in five minutes

1. **Sign up** -- you land in your own workspace as its admin.
2. **Settings → Chat widget** → *Open the demo page*. Send a message from the
   bubble; it appears in **Inbox** live, and your reply comes back to the
   widget without a reload. Type in either side to see the other's typing
   indicator, and watch "Seen" appear once the other end reads it.
3. **Settings → Team** → invite a second email as *agent*. Sign in with that
   address in another browser and it joins your workspace automatically --
   then assign the conversation to them from the inbox.
4. **Knowledge base** → add a category and publish an article. Start typing a
   word from its title in the widget: it's suggested inline.
5. **Inbox** → open a conversation with a few messages and hit *Summarize*.

## Tech stack

- **Next.js 16.2.12** (App Router, Turbopack) -- note: this version renamed
  `middleware.ts` to `proxy.ts` and some other conventions; see `AGENTS.md`.
- **React 19.2.4** / **react-dom 19.2.4**
- **TypeScript 5**, **Tailwind CSS 4**
- **Prisma 6.19.3** (`@prisma/client` 6.19.3) with the new `prisma-client`
  generator, backed by a local Prisma Postgres dev server
- **Clerk 7.6.3** (`@clerk/nextjs`) for auth
- **Pusher 5.3.4** / **pusher-js 8.6.0** for real-time message delivery
- **Resend 6.18.1** for outbound/inbound email
- **@anthropic-ai/sdk 0.115.0** (Claude Opus 5) for AI conversation summaries
- **Tiptap 3.29.2** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`) for
  the knowledge base rich-text editor
- **@upstash/ratelimit 2.0.8** / **@upstash/redis 1.38.0** for rate limiting
- **esbuild 0.28.1** to bundle the standalone embeddable widget
- **zod** (via `@anthropic-ai/sdk`'s structured-output helper) for the AI
  summary schema

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Environment variables** -- fill in `.env` (see the comments in that
   file for where to get each value):
   - `DATABASE_URL` -- see step 3
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (dashboard.clerk.com)
   - `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`,
     `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER` (dashboard.pusher.com)
   - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (console.upstash.com) --
     optional; rate limiting fails open (allows requests, logs a warning) if unset
   - `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_DOMAIN`, `EMAIL_FROM_ADDRESS`
     (resend.com) -- see the Email channel section below for what's real vs. deferred
   - `ANTHROPIC_API_KEY` (console.anthropic.com/settings/keys)
   - `NEXT_PUBLIC_APP_HOST` -- optional; the hostname the app itself serves
     from, so `src/proxy.ts` can tell it apart from a workspace's custom
     help-center domain. `localhost` and `*.vercel.app` are always recognised,
     so this is only needed on a non-Vercel production hostname.
   - `CRON_SECRET` -- optional; authenticates the scheduled snooze sweep. Unset
     means that route refuses to run, which breaks nothing (the inbox sweeps
     its own workspace on load).

3. **Start the local database** (Prisma Postgres, runs as a local dev server):
   ```
   npx prisma dev
   ```
   Leave this running in its own terminal. On first run it prints a
   connection string -- if `DATABASE_URL` in `.env` doesn't already match,
   run `npx prisma dev ls` and copy the `TCP` line (replace `localhost` with
   `127.0.0.1`; see the comment in `.env` for why). Then push the schema:
   ```
   npx prisma db push
   ```

4. **(Optional) Seed demo data** -- fill in the `CLERK_USER_ID` /
   `CLERK_USER_EMAIL` placeholders in `prisma/seed.ts` first, then:
   ```
   npx prisma db seed
   ```

5. **Run the app**
   ```
   npm run dev
   ```

6. **Build the embeddable widget** (reads `NEXT_PUBLIC_PUSHER_KEY`/`_CLUSTER`
   from `.env` at build time -- rerun this whenever those change):
   ```
   npm run build:widget
   ```
   This produces `public/widget.js`, loaded by `/demo` and by the
   `<script src="/widget.js" data-workspace-id="...">` embed snippet. Settings
   → Chat widget shows the snippet with your own workspace id filled in.

7. **Checks**
   ```
   npx tsc --noEmit                      # types
   npx eslint                            # lint
   npx tsx scripts/check-sanitizer.ts    # KB article sanitizer vs. XSS vectors
   npx tsx scripts/simulate-inbound-email.ts   # signed synthetic inbound email
   ```

## Architecture

**Auth / workspace / team.** Clerk handles sign-in/sign-up and session
verification; `src/proxy.ts` (Next 16's renamed middleware) protects `/inbox`,
`/kb`, `/settings`, `/invite`, and **all** of `/api/*` by default, with an
explicit opt-out list for the routes that genuinely can't have a Clerk session
(the widget, the inbound-email webhook, KB search, cron). It's written that way
round -- deny by default, opt out explicitly -- so a route added later is
secure unless someone deliberately makes it public.

`ensureWorkspace()` mirrors the signed-in Clerk user into a local `User` row,
redeems any invitation waiting on their email, and auto-creates a `Workspace` +
admin `WorkspaceMember` if nothing else applies. Every dashboard query derives
`workspaceId` from that function, never from a client-supplied value.

Admins invite teammates as **admin** or **agent** from Settings → Team, change
roles, and remove members (with a guard against removing or demoting the last
admin, which would leave the workspace unadministrable). Invitations are
redeemed two ways: by clicking the link, or automatically when the invited
address signs in -- matching on the email Clerk itself verified. The automatic
path is what makes invitations work at all in an environment where outbound
email isn't deliverable yet. A user invited into a second workspace gets a
workspace switcher in the sidebar; the active choice is a cookie that's
re-validated against real memberships on every request, so tampering with it
selects nothing.

**Chat widget + real-time.** `widget/src/index.ts` is a dependency-free,
shadow-DOM widget bundled standalone by esbuild (not part of the Next.js
bundle) so it can be embedded on any third-party page. It calls
`/api/widget/session` (public, rate-limited) to mint an opaque visitor token
and get-or-create an open conversation, then subscribes to a
`conversation-{id}` Pusher channel. Agent replies and visitor messages both
publish to that same channel, so the dashboard inbox and the widget update
live without polling.

Alongside messages, that channel carries three more event types, all handled
symmetrically on both sides:

- **Typing indicators** -- throttled (not debounced) so the other side sees
  "typing" *while* you're typing, and expired by a local TTL on receipt. There
  is deliberately no "stopped typing" event: a dropped one would leave the
  indicator stuck, whereas an expiring timer self-heals.
- **Read receipts** -- stored as a per-side watermark timestamp on the
  conversation (`agentLastReadAt` / `contactLastReadAt`) rather than a flag per
  message. One row to write on read instead of N, a later message is unread
  with no backfill, and out-of-order events are resolved by keeping the larger
  timestamp so "Seen" never walks backwards. The inbox's unread indicator is
  derived from the same watermark rather than a second, separately-maintained
  flag.
- **Online/offline** -- a heartbeat model, not connect/disconnect. The
  dashboard beats `/api/presence` while a tab is visible, the widget beats
  `/api/widget/events` while its panel is open, and "online" means "beat
  recently" (`PRESENCE_TTL_MS`, ~3x the interval so one dropped beat doesn't
  flicker). A closed laptop or a killed tab decays on its own; there is no
  disconnect event to miss and no stuck-online row to reconcile.

**Chat history persists** across reloads and return visits: the visitor token
lives in `localStorage`, `/api/widget/session` resolves it back to the contact
and returns that conversation's recent backlog (newest 50, so a long thread
can't turn every widget load into a huge payload).

Settings → Chat widget shows the copy-paste embed snippet with the workspace's
real id and links to `/demo?w={workspaceId}`, a bare host page that loads
`/widget.js` as an ordinary unmanaged `<script>` tag -- outside the dashboard's
React tree, exactly as a customer's site would.

**Email channel.** Outbound replies go through Resend and mint an RFC 5322
`Message-ID` embedding the conversation id, threading via `In-Reply-To`/
`References` built from every prior email `Message` in the conversation.
Inbound mail arrives as a signed Resend webhook
(`src/app/api/webhooks/email-inbound/route.ts`), verified with
`resend.webhooks.verify()` before anything is trusted, then matched back to
an existing conversation by scanning for a `Message.emailMessageId` in the
inbound `In-Reply-To`/`References` chain (falling back to a new conversation
if none matches).

**Knowledge base.** Agents write articles (Tiptap rich text) scoped to
`workspaceId`, with a `draft`/`published` status. The public help center
(`/help-center/{workspaceSlug}/...`), the custom-domain help center, and the
widget's live search (`/api/kb-search`) all filter `status: "published"`
directly in the top-level Prisma `where` clause -- deliberately not nested or
conditional -- so a draft article can't leak across the public boundary under
any input. The two public surfaces share one set of query helpers
(`src/lib/help-center.ts`) specifically so that filter is written once rather
than duplicated per route.

Article HTML is run through an allowlist sanitizer (`src/lib/sanitize-html.ts`)
before it's rendered with `dangerouslySetInnerHTML`. The tag/attribute set is
exactly what Tiptap's StarterKit emits; script, style, iframe, event handlers,
`javascript:` URLs and inline styles are dropped rather than escaped. It's
enforced at render rather than assumed from who can reach the editor, because
once a custom domain is live that content executes on the *customer's* own
hostname. `npx tsx scripts/check-sanitizer.ts` asserts it against the usual
XSS vectors.

**AI summary.** `summarizeConversation()` (`src/lib/ai.ts`) only calls Claude
when a conversation has 4+ messages and either has no cached summary or has
new messages since the cache was written; otherwise it returns the cached
result without an API call. On failure it logs the error and returns the
last good cached summary (marked stale) rather than overwriting it with a
bad one, so a Claude outage never corrupts existing data or crashes the
inbox page.

**Custom domain.** Admins set a `Workspace.customDomain` and DNS-verify it
(`/api/domain`, `/api/domain/verify`) via a CNAME lookup, and the app then
actually serves that hostname: `src/proxy.ts` treats any Host it doesn't
recognise as its own (not localhost, not `*.vercel.app`, not
`NEXT_PUBLIC_APP_HOST`) as a workspace's vanity domain and rewrites
`https://help.theircompany.com/{path}` to `/custom-domain/{host}/{path}`.
The host travels as a route param rather than being re-read from a header
downstream, so the page resolves the same workspace whether it arrived by
rewrite or was requested directly -- one code path, no hidden dependency on
header preservation. `/api/*`, `/_next/*`, and static files are excluded from
the rewrite so the widget and API keep working verbatim on a custom domain.

The lookup requires `customDomainVerified`, so an unverified claim 404s rather
than letting one workspace publish under a hostname it hasn't proven it
controls. The remaining step is external and manual: attaching the domain to
the Vercel project (which is also what provisions the Let's Encrypt
certificate) -- see Known limitations.

**Snooze.** `Conversation.snoozedUntil` is swept back to `open` two ways:
lazily when an agent loads the inbox (scoped to their workspace), and on a
schedule via `/api/cron/reopen-snoozed` (unscoped, wired up in `vercel.json`,
authenticated with `CRON_SECRET`). The lazy sweep is what makes snooze correct
with no infrastructure at all -- the status only matters when someone is
looking at the list, and by then it's already been fixed. Both filter on
`status: "snoozed"`, so a conversation an agent resolved by hand in the
meantime can't be undone by a sweep.

## Known limitations / what I'd do with more time

- **Attaching a custom domain to the deployment is still a manual step.** The
  app now serves verified custom domains end to end (Host-based rewrite in
  `src/proxy.ts`), but the domain must first be added to the Vercel project --
  Settings → Domains -- which is also where the admin gets the *exact* CNAME
  target to enter in their DNS, and what triggers Vercel to provision the
  Let's Encrypt certificate. Vercel's Domains API
  (`POST /v10/projects/{projectId}/domains`) could automate the attach step
  with a Vercel API token; TLS itself is not something to implement here.
  Relatedly, **no fixed CNAME target is printed in the domain-setup UI**, and
  deliberately so: Vercel assigns a unique target per project+domain rather
  than one global hostname, so the UI sends admins to their dashboard for the
  real value instead of a guess that would silently fail verification.
- **No real inbound email domain is verified**, so the inbound webhook path
  is exercised via `scripts/simulate-inbound-email.ts` (a signed synthetic
  payload) rather than a real mailbox. Real inbound requires verifying a
  domain in Resend, adding its MX record, and creating the webhook there --
  see the comment at the top of `src/app/api/webhooks/email-inbound/route.ts`.
  The same gap is why invitation emails are best-effort: the invite is
  redeemed by matching the address at sign-in, and the admin gets a copyable
  link, so a failed send never blocks anyone.
- **Presence and typing go over HTTP, not a persistent socket.** Both are
  ordinary POSTs that fan out through Pusher rather than client events on a
  presence channel. That avoids needing a Pusher auth endpoint and keeps the
  authorization check server-side (the widget's opaque token is verified on
  every signal), at the cost of one request per heartbeat and per throttled
  typing burst. At real volume the heartbeat is the piece to move onto a
  presence channel first.
- **Rate limiting fails open** if Upstash isn't configured (logs a warning,
  lets the request through) rather than blocking -- a deliberate choice so a
  missing env var degrades gracefully instead of taking down the widget, but
  worth tightening to fail closed for a production deployment. Realtime
  signals run on a separate, looser budget (`checkSignalRateLimit`) so
  typing indicators can't exhaust the budget that protects message sends.
  The cron sweep, by contrast, deliberately fails **closed** without
  `CRON_SECRET`: an unauthenticated endpoint that mutates status across every
  tenant is worth refusing to run.
- **Article search is a client-side substring filter**, not full-text search.
  Fine for the size of a typical help center and it keeps the page to a single
  round-trip, but it doesn't rank, stem, or match body text -- Postgres
  full-text search (or a dedicated index) is the next step.
- **AI summaries only; no AI reply drafts.** The stretch features (canned
  responses, SLA tracking, analytics, webhooks/REST API, contact timeline) are
  not built.

