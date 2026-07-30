import { NextResponse, type NextRequest } from "next/server";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { summarizeConversation } from "@/lib/ai";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
  const { workspaceId } = await ensureWorkspace();

  const result = await summarizeConversation(conversationId, workspaceId);

  if (result.status === "not_found") {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Every other outcome (insufficient_messages / unavailable / ok) is a
  // normal 200 -- the UI treats them all as states to render, never as
  // errors that should surface a 500.
  return NextResponse.json(result);
}
