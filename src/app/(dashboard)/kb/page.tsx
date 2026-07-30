import Link from "next/link";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { NewCategoryForm } from "./new-category-form";
import { NewArticleButton } from "./new-article-button";

export default async function KbPage() {
  const { workspaceId } = await ensureWorkspace();

  // workspaceId comes from the authenticated session via ensureWorkspace()
  // -- never from a client-supplied value -- so this can only ever list
  // this workspace's own categories/articles (drafts included -- this is
  // the internal management view, not the public help center).
  const categories = await db.category.findMany({
    where: { workspaceId },
    include: {
      articles: { orderBy: { title: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <main className="p-6 flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Knowledge base</h1>
        <NewCategoryForm />
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-gray-500">No categories yet -- create one to get started.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {categories.map((category) => (
            <li key={category.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">{category.name}</h2>
                <NewArticleButton categoryId={category.id} />
              </div>
              {category.articles.length === 0 ? (
                <p className="text-sm text-gray-500">No articles in this category yet.</p>
              ) : (
                <ul className="divide-y divide-gray-200 border border-gray-200 rounded">
                  {category.articles.map((article) => (
                    <li key={article.id}>
                      <Link
                        href={`/kb/${article.id}`}
                        className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        <span>{article.title}</span>
                        <span
                          className={`text-xs uppercase font-medium ${
                            article.status === "published" ? "text-green-600" : "text-gray-500"
                          }`}
                        >
                          {article.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
