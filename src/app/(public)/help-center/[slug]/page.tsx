import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ArticleSearch } from "./article-search";

// PUBLIC page -- no auth, no ensureWorkspace(). Anyone can request any
// workspace slug, so every query below is scoped by the resolved
// workspace.id AND explicitly filters `status: "published"` -- draft
// articles must never be reachable from here under any input.
export default async function PublicKbPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const workspace = await db.workspace.findUnique({ where: { slug } });
  if (!workspace) {
    notFound();
  }

  const categories = await db.category.findMany({
    where: { workspaceId: workspace.id },
    include: {
      // Explicit `status: "published"` -- this is the one filter that must
      // never be relaxed, omitted, or made conditional on this page.
      articles: { where: { status: "published" }, orderBy: { title: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  const nonEmptyCategories = categories.filter((category) => category.articles.length > 0);

  const allArticles = nonEmptyCategories.flatMap((category) =>
    category.articles.map((article) => ({ id: article.id, title: article.title, categoryName: category.name }))
  );

  return (
    <main className="p-6 max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{workspace.name} Help Center</h1>

      <ArticleSearch articles={allArticles} slug={slug} />

      {nonEmptyCategories.length === 0 ? (
        <p className="text-sm text-gray-500">No articles published yet.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {nonEmptyCategories.map((category) => (
            <li key={category.id} className="flex flex-col gap-2">
              <h2 className="font-medium">{category.name}</h2>
              <ul className="flex flex-col gap-1">
                {category.articles.map((article) => (
                  <li key={article.id}>
                    <Link href={`/help-center/${slug}/${article.id}`} className="text-sm text-blue-600 hover:underline">
                      {article.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
