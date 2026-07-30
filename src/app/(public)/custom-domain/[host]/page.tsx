import { notFound } from "next/navigation";
import { getWorkspaceByCustomDomain } from "@/lib/help-center";
import { HelpCenterIndex } from "@/components/help-center/help-center-index";

/**
 * What a request to `https://help.theircompany.com/` actually renders.
 *
 * src/proxy.ts rewrites any hostname that isn't one of the app's own into
 * `/custom-domain/{hostname}/...`, so the hostname arrives as a normal route
 * param instead of being re-read from a header downstream. One code path,
 * directly requestable, and no invisible dependency on the Host header
 * surviving the rewrite.
 *
 * `basePath` is "" because on a custom domain the help center *is* the site
 * root -- links must come out as `/{articleId}`, not `/help-center/...`.
 *
 * The lookup requires customDomainVerified (see getWorkspaceByCustomDomain):
 * an unverified domain is only a claim, so an unknown or unproven hostname
 * 404s rather than serving someone else's content.
 */
export default async function CustomDomainHelpCenterPage({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host } = await params;

  const workspace = await getWorkspaceByCustomDomain(host);
  if (!workspace) {
    notFound();
  }

  return <HelpCenterIndex workspace={workspace} basePath="" />;
}
