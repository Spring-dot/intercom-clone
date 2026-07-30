import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { AcceptInvite } from "./accept-invite";

/**
 * Landing page for an invitation link. Gated by proxy.ts, so anyone arriving
 * without a session is sent through sign-in first and returns here.
 *
 * Only ever renders what the *signed-in* viewer is entitled to know: if the
 * token doesn't match their verified email, they get the same generic message
 * as a bad token, and no workspace name is disclosed.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;

  const invitation = await db.invitation.findUnique({
    where: { token },
    include: { workspace: { select: { name: true } } },
  });

  const isRedeemable =
    Boolean(invitation) &&
    !invitation!.revokedAt &&
    invitation!.expiresAt > new Date() &&
    Boolean(email) &&
    invitation!.email.toLowerCase() === email!.toLowerCase();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6 py-24">
      {isRedeemable ? (
        <>
          <h1 className="text-xl font-semibold">
            Join {invitation!.workspace.name}
          </h1>
          <p className="text-sm text-gray-600">
            You&apos;ve been invited as {invitation!.role === "admin" ? "an admin" : "an agent"}.
          </p>
          <AcceptInvite token={token} />
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold">Invitation unavailable</h1>
          <p className="text-sm text-gray-600">
            This invitation isn&apos;t valid for your account. It may have been
            revoked or expired, or it may have been sent to a different email
            address than the one you&apos;re signed in with
            {email ? ` (${email})` : ""}.
          </p>
        </>
      )}
    </main>
  );
}
