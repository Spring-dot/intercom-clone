import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedArticle } from "@/lib/help-center";
import { sanitizeArticleHtml } from "@/lib/sanitize-html";

/**
 * A single published article. `getPublishedArticle` scopes by workspace AND
 * `status: "published"` in one query, so a draft -- or an articleId belonging
 * to some other workspace -- is indistinguishable from "doesn't exist" here.
 * That's deliberate: this route must never leak whether an unpublished
 * article exists.
 */
export async function ArticleView({
  workspace,
  articleId,
  basePath,
}: {
  workspace: { id: string; name: string };
  articleId: string;
  basePath: string;
}) {
  const article = await getPublishedArticle(workspace.id, articleId);
  if (!article) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <Link href={basePath || "/"} className="text-sm text-blue-600 hover:underline">
        &larr; Back to {workspace.name} Help Center
      </Link>
      <div>
        <p className="text-xs uppercase text-gray-500">{article.category.name}</p>
        <h1 className="text-xl font-semibold">{article.title}</h1>
      </div>
      {/*
        Tiptap-authored HTML, run through the allowlist sanitizer first -- see
        src/lib/sanitize-html.ts for why that happens at render rather than
        being assumed from who can reach the editor.
      */}
      <div
        className="prose text-sm"
        dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(article.content) }}
      />
    </main>
  );
}
