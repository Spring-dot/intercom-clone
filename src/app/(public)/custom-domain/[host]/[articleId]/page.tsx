import { notFound } from "next/navigation";
import { getWorkspaceByCustomDomain } from "@/lib/help-center";
import { ArticleView } from "@/components/help-center/article-view";

// A single article as served from a workspace's own domain -- the rewritten
// target of `https://help.theircompany.com/{articleId}`. See the sibling
// page.tsx for how the host becomes a route param.
export default async function CustomDomainArticlePage({
  params,
}: {
  params: Promise<{ host: string; articleId: string }>;
}) {
  const { host, articleId } = await params;

  const workspace = await getWorkspaceByCustomDomain(host);
  if (!workspace) {
    notFound();
  }

  return <ArticleView workspace={workspace} articleId={articleId} basePath="" />;
}
