import { notFound } from "next/navigation";
import { db } from "@/lib/db";

// PUBLIC page -- no auth. workspaceId is resolved from the slug (not
// trusted from anywhere else), and `status: "published"` is applied
// directly alongside it in the same query -- a draft article, or an
// articleId that belongs to a different workspace, is indistinguishable
// from "doesn't exist" here (404 either way), which is deliberate: this
// route must never leak whether an unpublished article exists.
export default async function PublicArticlePage({
  params,
}: {
  params: Promise<{ slug: string; articleId: string }>;
}) {
  const { slug, articleId } = await params;

  const workspace = await db.workspace.findUnique({ where: { slug } });
  if (!workspace) {
    notFound();
  }

  const article = await db.article.findFirst({
    where: { id: articleId, workspaceId: workspace.id, status: "published" },
    include: { category: true },
  });

  if (!article) {
    notFound();
  }

  return (
    <main className="p-6 max-w-2xl mx-auto flex flex-col gap-4">
      <a href={`/help-center/${slug}`} className="text-sm text-blue-600 hover:underline">
        &larr; Back to {workspace.name} Help Center
      </a>
      <div>
        <p className="text-xs uppercase text-gray-500">{article.category.name}</p>
        <h1 className="text-xl font-semibold">{article.title}</h1>
      </div>
      {/*
        Article.content is HTML produced by the Tiptap editor in the
        dashboard, authored by trusted workspace members (not visitor
        input) -- rendered as-is here. If this editor is ever opened up to
        lower-trust roles, this becomes a stored-XSS vector and should go
        through a sanitizer (e.g. DOMPurify) before render.
      */}
      <div
        className="prose text-sm"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
    </main>
  );
}
