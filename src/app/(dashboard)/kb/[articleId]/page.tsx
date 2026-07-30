import { notFound } from "next/navigation";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { ArticleEditor } from "./article-editor";

export default async function ArticleEditorPage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  const { workspaceId } = await ensureWorkspace();

  // Scoped by workspaceId from the session -- an articleId from another
  // workspace simply won't match any row here.
  const article = await db.article.findFirst({
    where: { id: articleId, workspaceId },
  });

  if (!article) {
    notFound();
  }

  const categories = await db.category.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
  });

  return (
    <main className="p-6">
      <ArticleEditor
        article={{
          id: article.id,
          title: article.title,
          content: article.content,
          status: article.status,
          categoryId: article.categoryId,
        }}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </main>
  );
}
