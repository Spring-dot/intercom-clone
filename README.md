# Intercom Clone

A multi-tenant customer support platform: a unified inbox for chat and email
conversations, an embeddable real-time chat widget, a public knowledge base,
AI-generated conversation summaries, and per-workspace custom domain support.
Every workspace is isolated by `workspaceId` at the query level -- no route
trusts a client-supplied tenant identifier.

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
   `<script src="/widget.js" data-workspace-id="...">` embed snippet.

## Architecture

**Auth / workspace.** Clerk handles sign-in/sign-up and session verification;
`src/proxy.ts` (Next 16's renamed middleware) gates `/inbox`, `/kb`,
`/settings`, and their `/api/*` counterparts behind a valid session.
`ensureWorkspace()` mirrors the signed-in Clerk user into a local `User` row
and auto-creates a `Workspace` + admin `WorkspaceMember` on first sign-in --
every dashboard query derives `workspaceId` from that function, never from a
client-supplied value.

**Chat widget + real-time.** `widget/src/index.ts` is a dependency-free,
shadow-DOM widget bundled standalone by esbuild (not part of the Next.js
bundle) so it can be embedded on any third-party page. It calls
`/api/widget/session` (public, rate-limited) to mint an opaque visitor token
and get-or-create an open conversation, then subscribes to a
`conversation-{id}` Pusher channel. Agent replies and visitor messages both
publish to that same channel, so the dashboard inbox and the widget update
live without polling.

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
(`/help-center/{workspaceSlug}/...`) and the widget's live search
(`/api/kb-search`) both filter `status: "published"` directly in the
top-level Prisma `where` clause -- deliberately not nested or conditional --
so a draft article can't leak across the public boundary under any input.

**AI summary.** `summarizeConversation()` (`src/lib/ai.ts`) only calls Claude
when a conversation has 4+ messages and either has no cached summary or has
new messages since the cache was written; otherwise it returns the cached
result without an API call. On failure it logs the error and returns the
last good cached summary (marked stale) rather than overwriting it with a
bad one, so a Claude outage never corrupts existing data or crashes the
inbox page.

**Custom domain.** Admins can set a `Workspace.customDomain` and DNS-verify
it (`/api/domain`, `/api/domain/verify`) via a CNAME lookup. This is
intentionally the full scope of what's built -- see Known limitations.

## Known limitations / what I'd do with more time

- **Custom domains don't actually serve traffic yet.** Setting and
  DNS-verifying a `customDomain` is real, but making
  `https://help.theircompany.com/` actually render that workspace's help
  center needs three more things, none built: (1) attaching the domain to
  the Vercel project -- currently manual via the Vercel dashboard, though
  Vercel's Domains API could automate it later; (2) TLS, which is automatic
  via Vercel/Let's Encrypt once (1) and DNS are both done -- not something to
  build ourselves; (3) Host-header-aware routing inside this app itself,
  since every route still assumes the `/help-center/{slug}/...` URL shape --
  this needs to be added to `src/proxy.ts` and is a distinct piece of work
  from DNS capture/verification. See the comment in `src/app/api/domain/route.ts`.
- **Snoozed conversations don't auto-reopen.** `Conversation.snoozedUntil` is
  stored and shown in the UI, but nothing flips `status` back to `open` when
  it elapses -- would need a cron/scheduled route (e.g. a Vercel Cron hitting
  an endpoint that queries `snoozedUntil < now()`).
- **No real inbound email domain is verified**, so the inbound webhook path
  is exercised via `scripts/simulate-inbound-email.ts` (a signed synthetic
  payload) rather than a real mailbox. Real inbound requires verifying a
  domain in Resend, adding its MX record, and creating the webhook there --
  see the comment at the top of `src/app/api/webhooks/email-inbound/route.ts`.
- **No real Vercel CNAME target is hardcoded in the domain-setup UI**, and
  deliberately so: Vercel assigns a unique CNAME target per project+domain,
  not one fixed global hostname, so the UI sends admins to the Vercel
  dashboard to get their actual target rather than printing a guessed value.
- **Article content is rendered via `dangerouslySetInnerHTML`** on the public
  help-center page. Safe today since only workspace members author it via
  Tiptap, but would need a sanitizer (e.g. DOMPurify) before the editor is
  ever opened to lower-trust roles.
- **Rate limiting fails open** if Upstash isn't configured (logs a warning,
  lets the request through) rather than blocking -- a deliberate choice so a
  missing env var degrades gracefully instead of taking down the widget, but
  worth tightening to fail closed for a production deployment.
- **Single membership assumed per user.** `ensureWorkspace()` returns the
  first `WorkspaceMember` row found for a user; multi-workspace membership
  (one user belonging to several workspaces) isn't modeled in the UI.

## Commit history

Commit history reflects the actual build order this project was developed
in, feature by feature -- it's a reasonable changelog if you want to see how
a given piece was introduced.
