"use client";

import { useCallback, useEffect, useState } from "react";

type AlertRecord = {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  body: string;
  status: string;
  dueAt: string | null;
};

type ImpactRecord = {
  id: string;
  status: string;
  rationale: string;
  createdAt: string;
};

interface MonitoringPayload {
  alerts: AlertRecord[];
  sourceChangeImpacts: ImpactRecord[];
}

export function MonitoringClient({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<MonitoringPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "refreshing">("loading");

  const load = useCallback(async () => {
    const response = await fetch(`/api/organizations/${organizationId}/compliance/monitoring`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Unable to load compliance monitoring");
    setData(await response.json() as MonitoringPayload);
  }, [organizationId]);

  useEffect(() => {
    load().then(() => setStatus("ready")).catch(() => setStatus("error"));
  }, [load]);

  async function refresh() {
    setStatus("refreshing");
    try {
      const response = await fetch(`/api/organizations/${organizationId}/compliance/monitoring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      if (!response.ok) throw new Error("Refresh failed");
      await load();
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  if (status === "loading") return <div className="empty-state">Loading governed compliance signals…</div>;
  if (status === "error") return <div className="empty-state error">Compliance monitoring could not be loaded for this organization.</div>;

  const alerts = data?.alerts ?? [];
  const impacts = data?.sourceChangeImpacts ?? [];

  return (
    <div className="monitoring-stack">
      <div className="monitoring-summary">
        <article><strong>{alerts.length}</strong><span>Active alerts</span></article>
        <article><strong>{impacts.length}</strong><span>Source-change impacts</span></article>
        <button className="secondary-button" type="button" onClick={refresh} disabled={status === "refreshing"}>
          {status === "refreshing" ? "Refreshing…" : "Refresh governed signals"}
        </button>
      </div>

      <section className="workspace-panel">
        <div className="section-heading"><div><p className="eyebrow">Compliance monitoring</p><h2>Alerts</h2></div></div>
        {alerts.length === 0 ? <div className="empty-state">No open compliance alerts.</div> : (
          <div className="signal-list">
            {alerts.map((alert) => (
              <article key={alert.id} className="signal-card">
                <div className="signal-meta"><span className="role-badge">{alert.severity}</span><span>{alert.status}</span></div>
                <h3>{alert.title}</h3>
                <p>{alert.body}</p>
                {alert.dueAt ? <small>Governed due date: {new Date(alert.dueAt).toLocaleString()}</small> : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="workspace-panel">
        <div className="section-heading"><div><p className="eyebrow">Authoritative source changes</p><h2>Reassessment queue</h2></div></div>
        {impacts.length === 0 ? <div className="empty-state">No unresolved source-change impacts.</div> : (
          <div className="signal-list">
            {impacts.map((impact) => (
              <article key={impact.id} className="signal-card">
                <div className="signal-meta"><span>{impact.status}</span><span>{new Date(impact.createdAt).toLocaleString()}</span></div>
                <p>{impact.rationale}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
