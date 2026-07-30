import { NextResponse, type NextRequest } from "next/server";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

const VALID_STATUSES = new Set(["draft", "published"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: articleId } = await params;
  const { workspaceId } = await ensureWorkspace();

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Scoped by workspaceId derived from the session -- an articleId from
  // another workspace will not match and is treated as not found.
  const article = await db.article.findFirst({
    where: { id: articleId, workspaceId },
    select: { id: true },
  });
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const data: Prisma.ArticleUpdateInput = {};

  if ("title" in payload) {
    if (typeof payload.title !== "string" || !payload.title.trim()) {
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    }
    data.title = payload.title.trim();
  }

  if ("content" in payload) {
    if (typeof payload.content !== "string") {
      return NextResponse.json({ error: "Invalid content" }, { status: 400 });
    }
    data.content = payload.content;
  }

  if ("status" in payload) {
    if (typeof payload.status !== "string" || !VALID_STATUSES.has(payload.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = payload.status as Prisma.ArticleUpdateInput["status"];
  }

  if ("categoryId" in payload) {
    if (typeof payload.categoryId !== "string") {
      return NextResponse.json({ error: "Invalid categoryId" }, { status: 400 });
    }
    // The category must belong to this same workspace -- otherwise a client
    // could move an article into a category it doesn't own.
    const category = await db.category.findFirst({
      where: { id: payload.categoryId, workspaceId },
      select: { id: true },
    });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    data.category = { connect: { id: payload.categoryId } };
  }

  const updated = await db.article.update({
    where: { id: articleId },
    data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: articleId } = await params;
  const { workspaceId } = await ensureWorkspace();

  const article = await db.article.findFirst({
    where: { id: articleId, workspaceId },
    select: { id: true },
  });
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  await db.article.delete({ where: { id: articleId } });

  return NextResponse.json({ ok: true });
}
