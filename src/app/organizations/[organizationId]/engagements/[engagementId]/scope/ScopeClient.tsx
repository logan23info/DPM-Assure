"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type FrameworkOption = { id: string; frameworkName: string; version: string; status: string };
type RequirementRow = { id: string; code: string; title: string; decision: string; rationale: string | null };

export function ScopeClient({ organizationId, engagementId, status, ready, frameworkOptions, requirements }: { organizationId: string; engagementId: string; status: string; ready: boolean; frameworkOptions: readonly FrameworkOption[]; requirements: readonly RequirementRow[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/organizations/${organizationId}/engagements/${engagementId}/scope`;
  async function act(payload: Record<string, unknown>) {
    setBusy(true); setMessage(null);
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.message ?? body.error ?? "Action failed"); return; }
    router.refresh();
  }
  if (status !== "PLANNING") return <div className="empty-state"><strong>Scope governance is locked.</strong><p>The engagement is {status}; framework and applicability history is preserved.</p></div>;
  return <div className="monitoring-stack">
    <section className="workspace-panel"><div className="section-heading"><div><p className="eyebrow">Framework</p><h2>Select authoritative framework version</h2></div></div><form className="auth-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act({ action: "select_framework", frameworkVersionId: data.get("frameworkVersionId") }); }}><label>Framework version<select name="frameworkVersionId" required defaultValue=""><option value="" disabled>Select version</option>{frameworkOptions.map((item) => <option key={item.id} value={item.id}>{item.frameworkName} · {item.version} · {item.status}</option>)}</select></label><button disabled={busy}>Select framework</button></form></section>
    <section className="workspace-panel"><div className="section-heading"><div><p className="eyebrow">Boundary</p><h2>Define scope</h2></div></div><form className="auth-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act({ action: "define_scope", name: data.get("name"), description: data.get("description"), scopeType: data.get("scopeType"), inScope: data.get("inScope") === "true", rationale: data.get("rationale") }); }}><label>Name<input name="name" required /></label><label>Scope type<input name="scopeType" required placeholder="APPLICATION / PROCESS / LOCATION / OTHER" /></label><label>Boundary<select name="inScope" defaultValue="true"><option value="true">IN SCOPE</option><option value="false">OUT OF SCOPE</option></select></label><label>Description<textarea name="description" rows={3} /></label><label>Rationale<textarea name="rationale" required rows={3} /></label><button disabled={busy}>Add scope boundary</button></form></section>
    <section className="workspace-panel"><div className="section-heading"><div><p className="eyebrow">Applicability</p><h2>Requirement decisions</h2></div><span className="count-badge">{requirements.filter((item) => item.decision === "PENDING").length} pending</span></div><div className="signal-list">{requirements.map((item) => <article className="signal-card" key={item.id}><div className="signal-meta"><span>{item.code}</span><span>{item.decision}</span></div><h3>{item.title}</h3>{item.rationale ? <p>{item.rationale}</p> : null}{item.decision === "PENDING" ? <form className="auth-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act({ action: "decide_applicability", requirementId: item.id, decision: data.get("decision"), rationale: data.get("rationale") }); }}><label>Decision<select name="decision" defaultValue="APPLICABLE"><option>APPLICABLE</option><option>NOT_APPLICABLE</option></select></label><label>Rationale<textarea name="rationale" required rows={2} /></label><button disabled={busy}>Record decision</button></form> : null}</article>)}</div></section>
    <section className="workspace-panel"><div className="section-heading"><div><p className="eyebrow">Scope readiness</p><h2>{ready ? "Scope gates passed" : "Scope gates incomplete"}</h2></div><span className="role-badge">{ready ? "READY" : "NOT READY"}</span></div><p className="lede compact">Ready requires at least one selected framework version, one in-scope boundary, and no pending requirement applicability decisions.</p></section>
    {message ? <p className="form-message error">{message}</p> : null}
  </div>;
}
