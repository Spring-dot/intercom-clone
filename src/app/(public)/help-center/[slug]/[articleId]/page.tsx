import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/help-center";
import { ArticleView } from "@/components/help-center/article-view";

// PUBLIC page -- see ArticleView for the published-only scoping.
export default async function PublicArticlePage({
  params,
}: {
  params: Promise<{ slug: string; articleId: string }>;
}) {
  const { slug, articleId } = await params;

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) {
    notFound();
  }

  return (
    <ArticleView
      workspace={workspace}
      articleId={articleId}
      basePath={`/help-center/${slug}`}
    />
  );
}
