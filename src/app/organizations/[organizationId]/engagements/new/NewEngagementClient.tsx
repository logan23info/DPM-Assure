"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewEngagementClient({ organizationId, clients }: { organizationId: string; clients: readonly { id: string; name: string }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/organizations/${organizationId}/engagements`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId: data.get("clientId"), name: data.get("name"), description: data.get("description") || null, startDate: data.get("startDate") || null, endDate: data.get("endDate") || null }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.message ?? "Unable to create engagement."); return; }
    router.push(`/organizations/${organizationId}/engagements/${body.engagement.id}`); router.refresh();
  }

  return <form className="auth-form" onSubmit={submit}>
    <label>Client<select name="clientId" required defaultValue=""><option value="" disabled>Select client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
    <label>Engagement name<input name="name" required minLength={3} maxLength={200} /></label>
    <label>Description<textarea name="description" rows={5} /></label>
    <div className="form-grid"><label>Start date<input name="startDate" type="date" /></label><label>End date<input name="endDate" type="date" /></label></div>
    <button disabled={busy || clients.length === 0}>{busy ? "Creating…" : "Create planning engagement"}</button>
    {message && <p className="form-message error">{message}</p>}
  </form>;
}
