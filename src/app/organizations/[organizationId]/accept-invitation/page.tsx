import Link from "next/link";

import { getCurrentUserContext } from "@/auth/current-user-context";

import AcceptInvitationClient from "./AcceptInvitationClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function AcceptInvitationPage({ params, searchParams }: PageProps) {
  const { organizationId } = await params;
  const { token = "" } = await searchParams;
  const current = await getCurrentUserContext();

  return (
    <main className="shell">
      <section className="hero auth-card">
        <p className="eyebrow">Organization invitation</p>
        <h1>Join DPM-Assure</h1>
        {!current ? (
          <>
            <p className="lede">Sign in with the email address that received this invitation, then reopen the invitation link from your email. Membership is not created until authenticated acceptance succeeds.</p>
            <Link className="primary-link" href="/login">Sign in securely</Link>
          </>
        ) : token.length < 32 ? (
          <p className="lede">This invitation link is incomplete or invalid.</p>
        ) : (
          <>
            <p className="lede">Signed in as {current.principal.email ?? current.principal.userId}. Acceptance will succeed only if this is the exact invited email address.</p>
            <AcceptInvitationClient organizationId={organizationId} token={token} />
          </>
        )}
      </section>
    </main>
  );
}
