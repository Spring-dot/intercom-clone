import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { widgetCorsHeaders } from "@/lib/cors";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: widgetCorsHeaders });
}

// PUBLIC, called directly by the widget on arbitrary third-party pages.
// `status: "published"` is written directly into the top-level `where`
// alongside workspaceId (not nested, not conditional, not added by a
// helper that could be skipped) -- this must never be able to return a
// draft article under any query string.
export async function GET(request: NextRequest) {
  const allowed = await checkRateLimit(getClientIp(request));
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: widgetCorsHeaders }
    );
  }

  const { searchParams } = request.nextUrl;
  const workspaceId = searchParams.get("workspaceId");
  const q = searchParams.get("q")?.trim() ?? "";

  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required" },
      { status: 400, headers: widgetCorsHeaders }
    );
  }

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true },
  });
  if (!workspace) {
    return NextResponse.json(
      { error: "Unknown workspace" },
      { status: 404, headers: widgetCorsHeaders }
    );
  }

  if (!q) {
    return NextResponse.json(
      { workspaceSlug: workspace.slug, articles: [] },
      { headers: widgetCorsHeaders }
    );
  }

  const articles = await db.article.findMany({
    where: {
      workspaceId,
      status: "published",
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true, title: true },
  });

  return NextResponse.json(
    { workspaceSlug: workspace.slug, articles },
    { headers: widgetCorsHeaders }
  );
}
