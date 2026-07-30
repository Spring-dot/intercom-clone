import Link from "next/link";
import { getPublishedCategories } from "@/lib/help-center";
import { ArticleSearch } from "./article-search";

/**
 * The public help-center landing view, shared by the built-in
 * /help-center/{slug} URL and by a workspace's verified custom domain (where
 * `basePath` is "" because the help center is the site root). Resolving the
 * workspace is the caller's job; by the time we get here it's already been
 * proven to belong to whoever asked for it.
 */
export async function HelpCenterIndex({
  workspace,
  basePath,
}: {
  workspace: { id: string; name: string };
  basePath: string;
}) {
  const categories = await getPublishedCategories(workspace.id);

  const allArticles = categories.flatMap((category) =>
    category.articles.map((article) => ({
      id: article.id,
      title: article.title,
      categoryName: category.name,
    }))
  );

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{workspace.name} Help Center</h1>

      <ArticleSearch articles={allArticles} basePath={basePath} />

      {categories.length === 0 ? (
        <p className="text-sm text-gray-500">No articles published yet.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {categories.map((category) => (
            <li key={category.id} className="flex flex-col gap-2">
              <h2 className="font-medium">{category.name}</h2>
              <ul className="flex flex-col gap-1">
                {category.articles.map((article) => (
                  <li key={article.id}>
                    <Link
                      href={`${basePath}/${article.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
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
