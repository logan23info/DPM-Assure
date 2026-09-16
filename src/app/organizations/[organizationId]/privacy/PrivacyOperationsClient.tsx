"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";

type Item = {
  id: string;
  name?: string;
  title?: string;
  state?: string;
  status?: string;
  decision?: string;
  destinationCountry?: string;
  requestType?: string;
  privacyRecordType?: string;
  candidateType?: string;
  suggestedTitle?: string;
  noticeKey?: string;
  approvedAt?: string | null;
  alertType?: string;
  severity?: string;
  dataCategory?: string;
  purpose?: string;
};

type Data = {
  clients: { id: string; name: string }[];
  engagements: { id: string; name: string; status: string }[];
  assuranceCandidates: Item[];
  retentionRules: Item[];
  notices: Item[];
  consents: Item[];
  alerts: Item[];
  activities: Item[];
  dpias: Item[];
  processors: Item[];
  transfers: Item[];
  dsrs: Item[];
  breaches: Item[];
};

const list = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];

export function PrivacyOperationsClient({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState("Loading privacy operations…");

  const load = useCallback(async () => {
    const response = await fetch(`/api/organizations/${organizationId}/privacy`, { cache: "no-store" });
    if (!response.ok) throw new Error("Privacy operations could not be loaded");
    const raw = await response.text();
    if (!raw.trim()) throw new Error("Privacy operations returned an empty response");
    try {
      setData(JSON.parse(raw) as Data);
    } catch {
      throw new Error("Privacy operations returned an invalid response");
    }
  }, [organizationId]);

  useEffect(() => {
    load().then(() => setMessage("")).catch((error: Error) => setMessage(error.message));
  }, [load]);

  async function send(body: Record<string, unknown>) {
    const response = await fetch(`/api/organizations/${organizationId}/privacy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    let output: { message?: string } = {};
    if (raw.trim()) {
      try {
        output = JSON.parse(raw) as { message?: string };
      } catch {
        output = { message: raw.trim() };
      }
    }
    if (!response.ok) throw new Error(output.message ?? "The governed change could not be saved");
  }

  async function submit(event: FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault();
    setMessage("Saving governed record…");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body: Record<string, unknown> = { ...Object.fromEntries(form.entries()), action };
    ["dataSubjectCategories", "personalDataCategories", "recipients", "dataCategories"].forEach((key) => {
      if (key in body) body[key] = list(form.get(key));
    });
    if (action === "create_dsr") body.receivedAt = new Date().toISOString();
    if (action === "record_consent") body.capturedAt = new Date().toISOString();
    if (action === "create_breach") {
      body.detectedAt = new Date().toISOString();
      body.notificationRequired = form.get("notificationRequired") === "on";
    }
    if (action === "propose_assurance_candidate") {
      const record = privacyRecords.find((item) => item.id === body.privacyRecordId);
      if (!record?.privacyRecordType) {
        setMessage("Select a privacy record before proposing assurance work.");
        return;
      }
      body.privacyRecordType = record.privacyRecordType;
    }
    try {
      await send(body);
      formElement.reset();
      await load();
      setMessage("Record saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save record");
    }
  }

  async function transition(action: string, idKey: string, id: string, status?: string) {
    setMessage("Recording governed lifecycle change…");
    try {
      await send({ action, [idKey]: id, ...(status ? { status } : {}) });
      await load();
      setMessage("Lifecycle change recorded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record lifecycle change");
    }
  }

  async function decideCandidate(candidateId: string, action: "accept_assurance_candidate" | "reject_assurance_candidate") {
    const rationale = window.prompt(action === "accept_assurance_candidate" ? "Why should this candidate be accepted?" : "Why should this candidate be rejected?");
    if (!rationale?.trim()) return;
    setMessage("Recording independent assurance decision…");
    try {
      await send({ action, candidateId, rationale });
      await load();
      setMessage("Assurance decision recorded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record assurance decision");
    }
  }

  const activities = data?.activities ?? [];
  const privacyRecords = [
    ...activities.map((item) => ({ ...item, privacyRecordType: "PROCESSING_ACTIVITY" })),
    ...(data?.dpias ?? []).map((item) => ({ ...item, privacyRecordType: "DPIA" })),
    ...(data?.processors ?? []).map((item) => ({ ...item, privacyRecordType: "PROCESSOR" })),
    ...(data?.transfers ?? []).map((item) => ({ ...item, privacyRecordType: "TRANSFER" })),
    ...(data?.retentionRules ?? []).map((item) => ({ ...item, privacyRecordType: "RETENTION_RULE" })),
    ...(data?.notices ?? []).map((item) => ({ ...item, privacyRecordType: "NOTICE" })),
    ...(data?.consents ?? []).map((item) => ({ ...item, privacyRecordType: "CONSENT" })),
    ...(data?.alerts ?? []).map((item) => ({ ...item, privacyRecordType: "PRIVACY_ALERT" })),
    ...(data?.dsrs ?? []).map((item) => ({ ...item, privacyRecordType: "DSR" })),
    ...(data?.breaches ?? []).map((item) => ({ ...item, privacyRecordType: "BREACH" })),
  ];
  return <div className="admin-stack">
    <p className="form-message" role="status">{message}</p>
    <Panel
      title="ROPA / processing activities"
      items={activities}
      actions={(item) => item.state !== "ACTIVE" ? <button type="button" className="secondary-button" onClick={() => transition("activate_activity", "activityId", item.id)}>Activate</button> : null}
      render={<form className="privacy-form" onSubmit={(event) => submit(event, "create_activity")}>
        <input name="name" required placeholder="Processing activity name" />
        <input name="purpose" required placeholder="Purpose" />
        <select name="controllerProcessorRole"><option>CONTROLLER</option><option>PROCESSOR</option><option>JOINT_CONTROLLER</option></select>
        <select name="clientId"><option value="">No client linkage</option>{data?.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
        <input name="lawfulBasis" placeholder="Lawful basis" />
        <input name="dataSubjectCategories" placeholder="Data subjects, comma separated" />
        <input name="personalDataCategories" placeholder="Personal data, comma separated" />
        <input name="recipients" placeholder="Recipients, comma separated" />
        <input name="retentionSummary" placeholder="Retention summary" />
        <input name="securityMeasuresSummary" placeholder="Security measures summary" />
        <button className="primary-button">Add processing activity</button>
      </form>}
    />
    <Panel
      title="DPIA management"
      items={data?.dpias ?? []}
      actions={(item) => item.decision === "REQUIRED" || item.decision === "REJECTED"
        ? <button type="button" className="secondary-button" onClick={() => transition("start_dpia", "dpiaId", item.id)}>Start assessment</button>
        : item.decision === "IN_PROGRESS"
          ? <button type="button" className="secondary-button" onClick={() => transition("approve_dpia", "dpiaId", item.id)}>Approve</button>
          : null}
      render={<form className="privacy-form" onSubmit={(event) => submit(event, "create_dpia")}>
        <select name="processingActivityId" required defaultValue=""><option value="" disabled>Select processing activity</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select>
        <select name="decision"><option>REQUIRED</option><option>NOT_REQUIRED</option><option>IN_PROGRESS</option><option>REJECTED</option></select>
        <input name="screeningRationale" required placeholder="Screening rationale" />
        <input name="riskSummary" placeholder="Risk summary" />
        <input name="mitigationSummary" placeholder="Mitigation summary" />
        <input name="residualRisk" placeholder="Residual risk" />
        <button className="primary-button">Create DPIA</button>
      </form>}
    />
    <Panel
      title="Processors and transfer assessments"
      items={[...(data?.processors ?? []), ...(data?.transfers ?? [])]}
      actions={(item) => item.name && item.status !== "ACTIVE"
        ? <button type="button" className="secondary-button" onClick={() => transition("activate_processor", "processorId", item.id)}>Approve processor</button>
        : item.destinationCountry && item.state === "DRAFT"
          ? <button type="button" className="secondary-button" onClick={() => transition("submit_transfer", "transferId", item.id)}>Send for review</button>
          : item.destinationCountry && item.state === "UNDER_REVIEW"
            ? <button type="button" className="secondary-button" onClick={() => transition("approve_transfer", "transferId", item.id)}>Approve transfer</button>
            : null}
      render={<>
        <form className="privacy-form" onSubmit={(event) => submit(event, "create_processor")}>
          <input name="name" required placeholder="Processor name" />
          <input name="serviceDescription" required placeholder="Service description" />
          <input name="country" placeholder="Country" />
          <input name="contractReference" placeholder="Contract reference" />
          <input name="dpaReference" placeholder="DPA reference" />
          <input name="securityReviewStatus" placeholder="Security review status" />
          <button className="primary-button">Register processor</button>
        </form>
        <form className="privacy-form" onSubmit={(event) => submit(event, "create_transfer")}>
          <select name="processingActivityId" required defaultValue=""><option value="" disabled>Select processing activity</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select>
          <select name="processorId"><option value="">No processor linkage</option>{data?.processors.map((processor) => <option key={processor.id} value={processor.id}>{processor.name}</option>)}</select>
          <input name="destinationCountry" required placeholder="Destination country" />
          <select name="mechanism"><option>SCC</option><option>ADEQUACY</option><option>BCR</option><option>DEROGATION</option><option>OTHER</option></select>
          <input name="mechanismReference" placeholder="Mechanism reference" />
          <input name="transferRiskAssessmentReference" placeholder="Transfer risk assessment ref" />
          <input name="supplementaryMeasures" placeholder="Supplementary measures" />
          <button className="primary-button">Record transfer assessment</button>
        </form>
      </>}
    />
    <Panel
      title="DSRs and breach register"
      items={[...(data?.dsrs ?? []), ...(data?.breaches ?? [])]}
      actions={(item) => item.requestType && item.status !== "COMPLETED"
        ? <button type="button" className="secondary-button" onClick={() => transition("transition_dsr", "dsrId", item.id, item.status === "RECEIVED" ? "IDENTITY_VERIFICATION" : "COMPLETED")}>{item.status === "RECEIVED" ? "Verify identity" : "Complete"}</button>
        : item.title && item.status !== "CLOSED"
          ? <button type="button" className="secondary-button" onClick={() => transition("transition_breach", "breachId", item.id, item.status === "TRIAGE" ? "INVESTIGATING" : "CLOSED")}>{item.status === "TRIAGE" ? "Start investigation" : "Close breach"}</button>
          : null}
      render={<>
        <form className="privacy-form" onSubmit={(event) => submit(event, "create_dsr")}>
          <input name="requestType" required placeholder="DSR request type" />
          <input name="subjectReferenceHash" required placeholder="Lowercase SHA-256 subject reference" />
          <input name="dueAt" type="datetime-local" />
          <button className="primary-button">Record DSR</button>
        </form>
        <form className="privacy-form" onSubmit={(event) => submit(event, "create_breach")}>
          <input name="title" required placeholder="Breach title" />
          <input name="description" required placeholder="Factual description" />
          <input name="dataCategories" placeholder="Data categories, comma separated" />
          <input name="affectedSubjectsEstimate" type="number" min="0" placeholder="Affected subjects" />
          <input name="severity" placeholder="Severity" />
          <input name="notificationRationale" placeholder="Notification rationale" />
          <label><input name="notificationRequired" type="checkbox" />Notification required</label>
          <button className="primary-button">Record breach</button>
        </form>
      </>}
    />
    <Panel
      title="Assurance linkage"
      items={data?.assuranceCandidates ?? []}
      actions={(item) => item.status === "PROPOSED" ? <>
        <button type="button" className="secondary-button" onClick={() => decideCandidate(item.id, "accept_assurance_candidate")}>Accept</button>
        <button type="button" className="secondary-button" onClick={() => decideCandidate(item.id, "reject_assurance_candidate")}>Reject</button>
      </> : null}
      render={<form className="privacy-form" onSubmit={(event) => submit(event, "propose_assurance_candidate")}>
        <select name="engagementId" required defaultValue=""><option value="" disabled>Select assurance engagement</option>{data?.engagements.map((engagement) => <option key={engagement.id} value={engagement.id}>{engagement.name} ({engagement.status})</option>)}</select>
        <select name="privacyRecordId" required defaultValue=""><option value="" disabled>Select privacy record</option>{privacyRecords.map((record) => <option key={`${record.privacyRecordType}:${record.id}`} value={record.id}>{record.privacyRecordType}: {record.name ?? record.title ?? record.destinationCountry ?? record.requestType ?? record.id}</option>)}</select>
        <select name="candidateType"><option>SCOPE</option><option>EVIDENCE_REQUEST</option></select>
        <input name="suggestedTitle" required placeholder="Suggested scope or evidence title" />
        <input name="rationale" required placeholder="Why this belongs in assurance work" />
        <input name="suggestedEvidence" placeholder="Suggested evidence, required for evidence request" />
        <button className="primary-button">Propose for assurance review</button>
      </form>}
    />
    <Panel
      title="Retention, notices and consent"
      items={[...(data?.retentionRules ?? []), ...(data?.notices ?? []), ...(data?.consents ?? [])]}
      actions={(item) => item.noticeKey && !item.approvedAt ? <button type="button" className="secondary-button" onClick={() => transition("approve_notice", "noticeId", item.id)}>Approve notice</button>
        : item.status === "GIVEN" ? <button type="button" className="secondary-button" onClick={() => transition("withdraw_consent", "consentId", item.id)}>Withdraw consent</button> : null}
      render={<>
        <form className="privacy-form" onSubmit={(event) => submit(event, "create_retention_rule")}>
          <select name="processingActivityId" required defaultValue=""><option value="" disabled>Select processing activity</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select>
          <input name="dataCategory" required placeholder="Data category" />
          <input name="retentionPeriod" required placeholder="Retention period" />
          <input name="triggerEvent" required placeholder="Retention trigger event" />
          <input name="disposalMethod" placeholder="Disposal method" />
          <input name="legalBasisReference" placeholder="Legal basis reference" />
          <button className="primary-button">Add retention rule</button>
        </form>
        <form className="privacy-form" onSubmit={(event) => submit(event, "register_notice")}>
          <input name="noticeKey" required placeholder="Notice identifier" />
          <input name="title" required placeholder="Notice title" />
          <input name="contentHash" required placeholder="Lowercase SHA-256 content hash" />
          <input name="storageReference" required placeholder="Private evidence storage reference" />
          <input name="effectiveAt" type="datetime-local" />
          <button className="primary-button">Register notice version</button>
        </form>
        <form className="privacy-form" onSubmit={(event) => submit(event, "record_consent")}>
          <input name="subjectReferenceHash" required placeholder="Lowercase SHA-256 subject reference" />
          <input name="purpose" required placeholder="Consent purpose" />
          <select name="processingActivityId"><option value="">No activity linkage</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select>
          <select name="noticeId"><option value="">No notice linkage</option>{data?.notices.map((notice) => <option key={notice.id} value={notice.id}>{notice.title ?? notice.noticeKey}</option>)}</select>
          <button className="primary-button">Record consent</button>
        </form>
      </>}
    />
    <Panel
      title="Privacy alerts"
      items={data?.alerts ?? []}
      actions={(item) => item.status === "OPEN" ? <button type="button" className="secondary-button" onClick={() => transition("acknowledge_privacy_alert", "alertId", item.id)}>Acknowledge</button>
        : item.status === "ACKNOWLEDGED" ? <button type="button" className="secondary-button" onClick={() => transition("resolve_privacy_alert", "alertId", item.id)}>Resolve</button> : null}
      render={<button type="button" className="primary-button" onClick={() => transition("refresh_privacy_alerts", "organizationId", organizationId)}>Refresh scheduled alerts</button>}
    />
  </div>;
}

function Panel({ title, items, render, actions }: { title: string; items: Item[]; render: ReactNode; actions?: (item: Item) => ReactNode }) {
  return <section className="workspace-panel">
    <div className="section-heading"><h2>{title}</h2><span className="count-badge">{items.length}</span></div>
    {render}
    <div className="data-list">
      {items.length ? items.map((item) => <article className="data-row" key={item.id}>
        <div><strong>{item.suggestedTitle ?? item.name ?? item.title ?? item.destinationCountry ?? item.dataCategory ?? item.purpose ?? item.requestType ?? item.alertType ?? "Privacy record"}</strong><span>{item.state ?? item.status ?? item.decision ?? item.severity ?? item.candidateType ?? "Recorded"}</span></div>
        {actions?.(item)}
      </article>) : <div className="empty-state">No records yet.</div>}
    </div>
  </section>;
}
