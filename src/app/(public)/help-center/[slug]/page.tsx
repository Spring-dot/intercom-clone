import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/help-center";
import { HelpCenterIndex } from "@/components/help-center/help-center-index";

// PUBLIC page -- no auth, no ensureWorkspace(). Anyone can request any
// workspace slug, so the workspace is resolved from the slug and every
// article query underneath is scoped to it and filtered to published.
export default async function PublicKbPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) {
    notFound();
  }

  return <HelpCenterIndex workspace={workspace} basePath={`/help-center/${slug}`} />;
}
