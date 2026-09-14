"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Assignee = { userId: string; email: string; displayName: string | null; role: string };
type Assignment = { id: string; userId: string; email: string; role: string; active: boolean };
type Check = { id: string; subjectUserId: string; email: string; result: string; conflictDetails: string | null; resolvedAt: string | null };
type Plan = { id: string; version: number; status: string; objectives: string; createdBy: string; approvedBy: string | null };

export function GovernanceClient({ organizationId, engagementId, status, ready, assignees, assignments, checks, plans }: {
  organizationId: string; engagementId: string; status: string; ready: boolean;
  assignees: readonly Assignee[]; assignments: readonly Assignment[]; checks: readonly Check[]; plans: readonly Plan[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/organizations/${organizationId}/engagements/${engagementId}/governance`;

  async function act(payload: Record<string, unknown>) {
    setBusy(true); setMessage(null);
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.message ?? body.error ?? "Action failed"); return false; }
    router.refresh(); return true;
  }

  if (status !== "PLANNING") return <div className="empty-state"><strong>Planning governance is locked.</strong><p>This engagement is currently {status}. Historical governance remains visible below.</p></div>;

  return <div className="monitoring-stack">
    <section className="workspace-panel">
      <div className="section-heading"><div><p className="eyebrow">Team</p><h2>Assignments</h2></div><span className="count-badge">{assignments.filter((item) => item.active).length}</span></div>
      <form className="auth-form" onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); await act({ action: "assign_user", userId: data.get("userId"), assignmentRole: data.get("assignmentRole") }); }}>
        <label>User<select name="userId" required defaultValue=""><option disabled value="">Select assurance member</option>{assignees.map((item) => <option key={item.userId} value={item.userId}>{item.email} · {item.role}</option>)}</select></label>
        <label>Assignment role<select name="assignmentRole" required defaultValue="AUDITOR"><option>AUDIT_MANAGER</option><option>LEAD_AUDITOR</option><option>AUDITOR</option><option>REVIEWER</option></select></label>
        <button disabled={busy}>Assign / update</button>
      </form>
    </section>

    <section className="workspace-panel">
      <div className="section-heading"><div><p className="eyebrow">Independence</p><h2>Conflict checks</h2></div><span className="count-badge">{checks.length}</span></div>
      <form className="auth-form" onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); await act({ action: "record_independence", subjectUserId: data.get("subjectUserId"), result: data.get("result"), conflictDetails: data.get("conflictDetails") }); }}>
        <label>Assigned user<select name="subjectUserId" required defaultValue=""><option disabled value="">Select assignee</option>{assignments.filter((item) => item.active).map((item) => <option key={item.userId} value={item.userId}>{item.email} · {item.role}</option>)}</select></label>
        <label>Result<select name="result" required defaultValue="CLEAR"><option>CLEAR</option><option>CONFLICT</option></select></label>
        <label>Conflict details<textarea name="conflictDetails" rows={3} placeholder="Required only for CONFLICT" /></label>
        <button disabled={busy}>Record independence check</button>
      </form>
      <div className="signal-list">{checks.filter((item) => item.result === "CONFLICT" && !item.resolvedAt).map((item) => <article className="signal-card" key={item.id}><strong>Unresolved conflict · {item.email}</strong><p>{item.conflictDetails}</p><button className="secondary-button" disabled={busy} onClick={() => void act({ action: "resolve_conflict", independenceCheckId: item.id })}>Resolve conflict</button></article>)}</div>
    </section>

    <section className="workspace-panel">
      <div className="section-heading"><div><p className="eyebrow">Risk</p><h2>Preliminary risk assessment</h2></div></div>
      <form className="auth-form" onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); await act({ action: "record_risk", methodVersion: data.get("methodVersion"), inherentScore: data.get("inherentScore"), controlScore: data.get("controlScore"), residualScore: data.get("residualScore"), rationale: data.get("rationale") }); }}>
        <label>Method version<input name="methodVersion" required placeholder="DPM-PRELIM-RISK-1" /></label>
        <div className="form-grid"><label>Inherent score<input name="inherentScore" type="number" min="0" step="0.01" /></label><label>Control score<input name="controlScore" type="number" min="0" step="0.01" /></label><label>Residual score<input name="residualScore" type="number" min="0" step="0.01" /></label></div>
        <label>Rationale<textarea name="rationale" required rows={4} /></label><button disabled={busy}>Record assessment</button>
      </form>
    </section>

    <section className="workspace-panel">
      <div className="section-heading"><div><p className="eyebrow">Plan</p><h2>Audit plan</h2></div><span className="count-badge">{plans.length}</span></div>
      <form className="auth-form" onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); await act({ action: "create_plan", objectives: data.get("objectives"), scopeSummary: data.get("scopeSummary"), samplingApproach: data.get("samplingApproach") }); }}>
        <label>Objectives<textarea name="objectives" required rows={4} /></label><label>Scope summary<textarea name="scopeSummary" required rows={4} /></label><label>Sampling approach<textarea name="samplingApproach" rows={3} /></label><button disabled={busy}>Create new plan version</button>
      </form>
      <div className="signal-list">{plans.map((plan) => <article className="signal-card" key={plan.id}><div className="signal-meta"><span>Version {plan.version}</span><span>{plan.status}</span></div><p>{plan.objectives}</p>{plan.status !== "APPROVED" ? <button className="secondary-button" disabled={busy} onClick={() => void act({ action: "approve_plan", auditPlanId: plan.id })}>Approve plan</button> : null}</article>)}</div>
    </section>

    <section className="workspace-panel"><div className="section-heading"><div><p className="eyebrow">Readiness</p><h2>{ready ? "Governance gates passed" : "Governance gates incomplete"}</h2></div><span className="role-badge">{ready ? "READY" : "NOT READY"}</span></div><p className="lede compact">Testing can begin only when PostgreSQL confirms the engagement governance readiness function is true.</p><button className="primary-link" disabled={busy || !ready} onClick={() => void act({ action: "start_testing" })}>Start testing</button></section>
    {message && <p className="form-message error">{message}</p>}
  </div>;
}
