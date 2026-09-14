import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUserContext } from "@/auth/current-user-context";
import { MonitoringClient } from "./MonitoringClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ organizationId: string }>;
}

export default async function ComplianceMonitoringPage({ params }: PageProps) {
  const current = await getCurrentUserContext();
  if (!current) redirect("/login");

  const { organizationId } = await params;
  const membership = current.memberships.find((item) => item.organizationId === organizationId);
  if (!membership) notFound();

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <Link className="back-link" href="/dashboard">← Dashboard</Link>
          <p className="eyebrow">{membership.organizationName}</p>
          <h1>Compliance monitoring</h1>
          <p className="lede compact">Source-backed obligations, overdue signals, and authoritative-source change impacts.</p>
        </div>
        <div className="header-meta">
          <span className="role-badge">{membership.role.replaceAll("_", " ")}</span>
          <form action="/api/auth/logout" method="post">
            <button className="secondary-button" type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <MonitoringClient organizationId={organizationId} />
    </main>
  );
}
