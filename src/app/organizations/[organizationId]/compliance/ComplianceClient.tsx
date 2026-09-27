"use client";

import { type FormEvent, useCallback, useState } from "react";

type Profile = { id: string; name: string; jurisdiction: string; status: string };
type Fact = { id: string; profileId: string; factKey: string; factValue: string; sourceReference: string };
type Rule = { id: string; ruleKey: string; version: number; jurisdiction: string; triggerType: string; offsetValue: number; offsetUnit: string; conditionFacts: Record<string, string> };
type Determination = { id: string; profileId: string; obligationRuleId: string; result: string; rationale: string; evaluatedAt: string | Date };
type Obligation = { id: string; applicabilityDeterminationId: string; dueAt: string | Date; triggerAt: string | Date; status: string; sourceReference: string };
export type CompliancePayload = { profiles: Profile[]; facts: Fact[]; rules: Rule[]; determinations: Determination[]; obligations: Obligation[] };

export function ComplianceClient({ organizationId, canManage, initialData }: { organizationId: string; canManage: boolean; initialData: CompliancePayload }) {
  const [data, setData] = useState<CompliancePayload>(initialData);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/organizations/${organizationId}/compliance`, { cache: "no-store" });
    const body = await response.json() as CompliancePayload & { message?: string };
    if (!response.ok) throw new Error(body.message ?? "Compliance profiles could not be loaded");
    setData(body);
  }, [organizationId]);

  async function submit(event: FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const values = Object.fromEntries(new FormData(formElement).entries());
    setBusy(true);
    setMessage("Saving governed compliance record…");
    try {
      const response = await fetch(`/api/organizations/${organizationId}/compliance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...values }),
      });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Compliance action was rejected");
      formElement.reset();
      await load();
      setMessage("Governed compliance record saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Compliance action was rejected");
    } finally {
      setBusy(false);
    }
  }

  const profiles = data.profiles;
  const facts = data.facts;
  const rules = data.rules;
  const determinations = data.determinations;
  const obligations = data.obligations;

  return <div className="admin-stack">
    <p className="form-message" role="status">{message}</p>
    <section className="monitoring-summary">
      <article><strong>{profiles.length}</strong><span>Compliance profiles</span></article>
      <article><strong>{determinations.filter((item) => item.result === "APPLICABLE").length}</strong><span>Applicable rules</span></article>
      <article><strong>{obligations.length}</strong><span>Open obligations</span></article>
    </section>

    <section className="workspace-panel">
      <div className="section-heading"><div><p className="eyebrow">Organization facts</p><h2>Compliance profiles</h2></div><span className="count-badge">{profiles.length}</span></div>
      {canManage ? <div className="organization-grid">
        <form className="organization-card auth-form" onSubmit={(event) => submit(event, "create_profile")}>
          <h3>Create profile</h3>
          <label>Profile name<input name="name" required placeholder="Primary operating profile" /></label>
          <label>Jurisdiction<input name="jurisdiction" required placeholder="IN" /></label>
          <button disabled={busy}>Create profile</button>
        </form>
        <form className="organization-card auth-form" onSubmit={(event) => submit(event, "set_fact")}>
          <h3>Validate profile fact</h3>
          <label>Profile<select name="profileId" required defaultValue=""><option value="" disabled>Select profile</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
          <label>Fact key<input name="factKey" required placeholder="ENTITY_ROLE" /></label>
          <label>Fact value<input name="factValue" required placeholder="CONTROLLER" /></label>
          <label>Source reference<input name="sourceReference" required placeholder="Validated onboarding record" /></label>
          <button disabled={busy}>Save validated fact</button>
        </form>
      </div> : <p className="lede compact">Read-only access. Organization administrators validate profile facts and run determinations.</p>}
      <div className="data-list">{profiles.map((profile) => <article className="data-row" key={profile.id}><div><strong>{profile.name}</strong><span>{profile.jurisdiction} · {profile.status} · {facts.filter((fact) => fact.profileId === profile.id).length} facts</span></div></article>)}</div>
    </section>

    <section className="workspace-panel">
      <div className="section-heading"><div><p className="eyebrow">Deterministic rules</p><h2>Applicability</h2></div><span className="count-badge">{rules.length}</span></div>
      {canManage ? <form className="privacy-form" onSubmit={(event) => submit(event, "evaluate_applicability")}>
        <label>Profile<select name="profileId" required defaultValue=""><option value="" disabled>Select profile</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
        <label>Source-backed rule<select name="obligationRuleId" required defaultValue=""><option value="" disabled>Select rule</option>{rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.ruleKey} v{rule.version} · {rule.jurisdiction}</option>)}</select></label>
        <button disabled={busy}>Evaluate applicability</button>
      </form> : null}
      <div className="signal-list">{determinations.length ? determinations.map((item) => <article className="signal-card" key={item.id}><div className="signal-meta"><span className="role-badge">{item.result}</span><span>{new Date(item.evaluatedAt).toLocaleString()}</span></div><p>{item.rationale}</p></article>) : <div className="empty-state">No applicability determinations yet.</div>}</div>
    </section>

    <section className="workspace-panel">
      <div className="section-heading"><div><p className="eyebrow">Source-derived deadlines</p><h2>Obligations</h2></div><span className="count-badge">{obligations.length}</span></div>
      {canManage ? <form className="privacy-form" onSubmit={(event) => submit(event, "materialize_obligation")}>
        <label>Applicable determination<select name="determinationId" required defaultValue=""><option value="" disabled>Select determination</option>{determinations.filter((item) => item.result === "APPLICABLE").map((item) => <option key={item.id} value={item.id}>{item.id.slice(0, 8)} · {item.result}</option>)}</select></label>
        <label>Trigger date and time<input name="triggerAt" type="datetime-local" required /></label>
        <button disabled={busy}>Materialize obligation</button>
      </form> : null}
      <div className="signal-list">{obligations.length ? obligations.map((item) => <article className="signal-card" key={item.id}><div className="signal-meta"><span className="role-badge">{item.status}</span><span>Due {new Date(item.dueAt).toLocaleString()}</span></div><h3>{item.sourceReference}</h3><p>Triggered {new Date(item.triggerAt).toLocaleString()}</p></article>) : <div className="empty-state">No open obligations.</div>}</div>
    </section>
  </div>;
}
