import { NextResponse, type NextRequest } from "next/server";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const { workspaceId, userId } = await ensureWorkspace();

  if (!(await checkRateLimit(userId))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const payload = await request.json().catch(() => null);
  const categoryId = typeof payload?.categoryId === "string" ? payload.categoryId : null;
  if (!categoryId) {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
  }

  // The category must belong to this workspace -- otherwise a client could
  // attach a new article to a category it doesn't own.
  const category = await db.category.findFirst({
    where: { id: categoryId, workspaceId },
    select: { id: true },
  });
  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const title = typeof payload?.title === "string" && payload.title.trim() ? payload.title.trim() : "Untitled article";

  const article = await db.article.create({
    data: {
      workspaceId,
      categoryId,
      title,
      slug: slugify(title),
      content: "",
      status: "draft",
    },
  });

  return NextResponse.json(article, { status: 201 });
}
