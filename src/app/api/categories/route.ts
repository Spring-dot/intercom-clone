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
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  }

  const category = await db.category.create({
    data: { workspaceId, name, slug: slugify(name) },
  });

  return NextResponse.json(category, { status: 201 });
}
