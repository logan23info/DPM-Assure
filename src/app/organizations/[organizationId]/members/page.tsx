import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUserContext } from "@/auth/current-user-context";

import MembersClient from "./MembersClient";

export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ organizationId: string }>; }

export default async function OrganizationMembersPage({ params }: PageProps) {
  const { organizationId } = await params;
  const current = await getCurrentUserContext();
  if (!current) redirect("/login");

  const membership = current.memberships.find((item) => item.organizationId === organizationId);
  if (!membership) notFound();
  if (membership.role !== "ORG_ADMIN" && membership.role !== "SUPER_ADMIN") redirect("/dashboard");

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Organization administration</p>
          <h1>{membership.organizationName}</h1>
          <p className="lede compact">Invite users, manage membership roles, and preserve tenant administration safeguards.</p>
        </div>
        <Link className="secondary-button" href="/dashboard">Back to workspace</Link>
      </header>
      <MembersClient organizationId={organizationId} />
    </main>
  );
}
