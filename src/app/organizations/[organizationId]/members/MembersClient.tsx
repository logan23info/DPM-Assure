"use client";

import { useCallback, useEffect, useState } from "react";

type Role = "ORG_ADMIN" | "AUDIT_MANAGER" | "LEAD_AUDITOR" | "AUDITOR" | "REVIEWER" | "CLIENT" | "VIEWER";
type Member = {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  role: Role;
  status: "ACTIVE" | "INACTIVE";
};
type Invitation = {
  id: string;
  email: string;
  role: Role;
  status: string;
  expiresAt: string;
};

const roles: Role[] = ["ORG_ADMIN","AUDIT_MANAGER","LEAD_AUDITOR","AUDITOR","REVIEWER","CLIENT","VIEWER"];

export default function MembersClient({ organizationId }: { organizationId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("AUDITOR");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const endpoint = `/api/organizations/${organizationId}/members`;
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message ?? body.error ?? "Unable to load organization users");
    setMembers(body.members ?? []);
    setInvitations(body.invitations ?? []);
  }, [endpoint]);

  useEffect(() => { void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to load")); }, [load]);

  async function command(body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? result.error ?? "Operation failed");
      await load();
      return result;
    } finally { setBusy(false); }
  }

  return (
    <div className="admin-stack">
      <section className="workspace-panel">
        <div className="section-heading"><div><p className="eyebrow">Controlled onboarding</p><h2>Invite member</h2></div></div>
        <form className="inline-form" onSubmit={async (event) => {
          event.preventDefault();
          try {
            await command({ action: "invite", email, role });
            setEmail("");
            setMessage("Invitation created and email delivery requested.");
          } catch (error) { setMessage(error instanceof Error ? error.message : "Invitation failed"); }
        }}>
          <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Role<select value={role} onChange={(event) => setRole(event.target.value as Role)}>{roles.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
          <button className="primary-button" disabled={busy} type="submit">Send invitation</button>
        </form>
        {message ? <p className="form-message" role="status">{message}</p> : null}
      </section>

      <section className="workspace-panel">
        <div className="section-heading"><div><p className="eyebrow">Pending</p><h2>Invitations</h2></div><span className="count-badge">{invitations.length}</span></div>
        {invitations.length === 0 ? <div className="empty-state"><strong>No pending invitations</strong></div> : (
          <div className="data-list">{invitations.map((invitation) => (
            <article className="data-row" key={invitation.id}>
              <div><strong>{invitation.email}</strong><span>{invitation.role.replaceAll("_", " ")} · expires {new Date(invitation.expiresAt).toLocaleString()}</span></div>
              <button className="secondary-button" disabled={busy} onClick={() => void command({ action: "cancel_invitation", invitationId: invitation.id }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Cancellation failed"))}>Cancel</button>
            </article>
          ))}</div>
        )}
      </section>

      <section className="workspace-panel">
        <div className="section-heading"><div><p className="eyebrow">Active directory</p><h2>Members</h2></div><span className="count-badge">{members.length}</span></div>
        <div className="data-list">{members.map((member) => (
          <article className="data-row member-row" key={member.membershipId}>
            <div><strong>{member.displayName || member.email}</strong><span>{member.email}</span></div>
            <select aria-label={`Role for ${member.email}`} value={member.role} disabled={busy} onChange={(event) => void command({ action: "update_member", membershipId: member.membershipId, role: event.target.value }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Role update failed"))}>{roles.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
            <button className="secondary-button" disabled={busy} onClick={() => void command({ action: "update_member", membershipId: member.membershipId, status: member.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Status update failed"))}>{member.status === "ACTIVE" ? "Deactivate" : "Reactivate"}</button>
          </article>
        ))}</div>
      </section>
    </div>
  );
}
