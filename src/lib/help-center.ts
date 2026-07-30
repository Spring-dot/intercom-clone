import "server-only";
import { db } from "@/lib/db";

/**
 * Shared data access for the two public help-center surfaces: the built-in
 * `/help-center/{workspaceSlug}` URL and a workspace's own verified custom
 * domain. Both go through these functions specifically so the
 * `status: "published"` filter is written once, in a top-level `where` --
 * duplicating it per route is how a draft eventually leaks from the surface
 * someone forgot to update.
 */

export async function getWorkspaceBySlug(slug: string) {
  return db.workspace.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
}

/**
 * Resolves the workspace that owns a vanity hostname. Requires
 * `customDomainVerified` -- an unverified row is only a claim, and serving
 * content for a domain whose DNS was never proven to point here would let one
 * workspace publish under a hostname it doesn't control.
 */
export async function getWorkspaceByCustomDomain(host: string) {
  return db.workspace.findFirst({
    where: { customDomain: host.toLowerCase(), customDomainVerified: true },
    select: { id: true, name: true, slug: true },
  });
}

export async function getPublishedCategories(workspaceId: string) {
  const categories = await db.category.findMany({
    where: { workspaceId },
    include: {
      articles: { where: { status: "published" }, orderBy: { title: "asc" } },
    },
    orderBy: { name: "asc" },
  });
  return categories.filter((category) => category.articles.length > 0);
}

export async function getPublishedArticle(workspaceId: string, articleId: string) {
  return db.article.findFirst({
    where: { id: articleId, workspaceId, status: "published" },
    include: { category: true },
  });
}
