import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { db } from "@/lib/db";

// Per current Anthropic model guidance: default to claude-opus-5 unless a
// caller explicitly asks for something else -- this is a bounded structured-
// extraction task, so effort is kept low (see below) rather than downgrading
// the model tier for cost.
const SUMMARY_MODEL = "claude-opus-5";
const MIN_MESSAGES_FOR_SUMMARY = 4;
const CLAUDE_TIMEOUT_MS = 10_000;

const conversationSummarySchema = z.object({
  whatUserWants: z.string(),
  whatsBeenTried: z.string(),
  currentStatus: z.string(),
});

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export type SummarizeConversationResult =
  | { status: "not_found" }
  | { status: "insufficient_messages" }
  | { status: "unavailable" }
  | { status: "ok"; summary: ConversationSummary; updatedAt: string; stale: boolean };

// Lazy: constructing `new Anthropic()` eagerly with an empty key can break
// `next build`'s page-data collection for every route that imports this
// module, the same issue as the Resend/Redis clients elsewhere in this repo.
let anthropicClient: Anthropic | undefined;
function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || "placeholder-not-configured",
    });
  }
  return anthropicClient;
}

function parseCachedSummary(raw: string | null): ConversationSummary | null {
  if (!raw) return null;
  try {
    const result = conversationSummarySchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Summarizes a conversation for the agent's quick reference, with the
 * conversation looked up scoped to `workspaceId` -- a conversationId from
 * another workspace simply won't match, same ownership pattern as every
 * other conversation-touching function in this codebase.
 *
 * Only calls Claude when there's something new to summarize (>= 4 messages,
 * and either no cached summary yet or messages newer than the cached one).
 * Otherwise returns the cached summary unchanged -- never calls the LLM
 * needlessly. On an LLM failure, the existing cached row is left untouched
 * (no risk of overwriting a good summary with garbage); if a cached summary
 * exists it's returned with `stale: true` so the caller can still show
 * something useful, otherwise the result is `{status: "unavailable"}`.
 */
export async function summarizeConversation(
  conversationId: string,
  workspaceId: string
): Promise<SummarizeConversationResult> {
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!conversation) {
    return { status: "not_found" };
  }

  const cached = parseCachedSummary(conversation.aiSummary);
  const cachedUpdatedAt = conversation.aiSummaryUpdatedAt;

  if (conversation.messages.length < MIN_MESSAGES_FOR_SUMMARY) {
    return cached && cachedUpdatedAt
      ? { status: "ok", summary: cached, updatedAt: cachedUpdatedAt.toISOString(), stale: false }
      : { status: "insufficient_messages" };
  }

  const lastMessageAt = conversation.messages[conversation.messages.length - 1]!.createdAt;
  const needsRegeneration = !cached || !cachedUpdatedAt || lastMessageAt > cachedUpdatedAt;

  if (!needsRegeneration && cached && cachedUpdatedAt) {
    return { status: "ok", summary: cached, updatedAt: cachedUpdatedAt.toISOString(), stale: false };
  }

  const transcript = conversation.messages.map((m) => `[${m.senderType}] ${m.body}`).join("\n");

  try {
    const message = await getAnthropic().messages.parse(
      {
        model: SUMMARY_MODEL,
        max_tokens: 1024,
        output_config: {
          effort: "low",
          format: zodOutputFormat(conversationSummarySchema),
        },
        messages: [
          {
            role: "user",
            content:
              "You are summarizing a customer support conversation for an agent's quick reference. " +
              "Based on the transcript below, identify: what the customer wants, what has been tried " +
              "so far, and the current status of the conversation. Be concise -- one or two sentences " +
              `per field.\n\nTranscript:\n${transcript}`,
          },
        ],
      },
      { timeout: CLAUDE_TIMEOUT_MS }
    );

    if (!message.parsed_output) {
      throw new Error(`No parsed_output in Claude response (stop_reason: ${message.stop_reason})`);
    }

    const summary = message.parsed_output;
    const now = new Date();

    await db.conversation.update({
      where: { id: conversationId },
      data: { aiSummary: JSON.stringify(summary), aiSummaryUpdatedAt: now },
    });

    return { status: "ok", summary, updatedAt: now.toISOString(), stale: false };
  } catch (error) {
    console.error("[ai] failed to summarize conversation", conversationId, error);
    if (cached && cachedUpdatedAt) {
      return { status: "ok", summary: cached, updatedAt: cachedUpdatedAt.toISOString(), stale: true };
    }
    return { status: "unavailable" };
  }
}
