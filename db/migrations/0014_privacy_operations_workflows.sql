-- DPM-Assure privacy operations workflow governance
-- Deterministic operational state transitions and completion/approval gates.

ALTER TABLE processing_activities
  ADD COLUMN reviewed_by uuid REFERENCES users(id),
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN next_review_at timestamptz;

ALTER TABLE processors
  ADD COLUMN due_diligence_completed_at timestamptz,
  ADD COLUMN approved_by uuid REFERENCES users(id),
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN next_review_at timestamptz;

ALTER TABLE international_transfers
  ADD COLUMN approved_by uuid REFERENCES users(id),
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN next_review_at timestamptz;

CREATE OR REPLACE FUNCTION enforce_processing_activity_state()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.state = NEW.state THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND NOT (
    (OLD.state='DRAFT' AND NEW.state IN ('ACTIVE','ARCHIVED')) OR
    (OLD.state='ACTIVE' AND NEW.state IN ('UNDER_REVIEW','CLOSED','ARCHIVED')) OR
    (OLD.state='UNDER_REVIEW' AND NEW.state IN ('ACTIVE','CLOSED','ARCHIVED')) OR
    (OLD.state='CLOSED' AND NEW.state='ARCHIVED')
  ) THEN
    RAISE EXCEPTION 'Invalid processing activity transition: % -> %', OLD.state, NEW.state;
  END IF;

  IF NEW.state IN ('ACTIVE','CLOSED','ARCHIVED') AND (NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL) THEN
    RAISE EXCEPTION 'Processing activity state % requires review metadata', NEW.state;
  END IF;

  IF NEW.reviewed_at IS NOT NULL AND NEW.reviewed_by IS NULL THEN
    RAISE EXCEPTION 'reviewed_at requires reviewed_by';
  END IF;

  RETURN NEW;
END $$;
CREATE TRIGGER processing_activities_state_guard
BEFORE UPDATE OF state, reviewed_by, reviewed_at ON processing_activities
FOR EACH ROW EXECUTE FUNCTION enforce_processing_activity_state();

CREATE OR REPLACE FUNCTION enforce_dpia_decision_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.decision = NEW.decision THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NOT (
    (OLD.decision='REQUIRED' AND NEW.decision IN ('IN_PROGRESS','REJECTED')) OR
    (OLD.decision='IN_PROGRESS' AND NEW.decision IN ('APPROVED','REJECTED')) OR
    (OLD.decision='REJECTED' AND NEW.decision='IN_PROGRESS')
  ) THEN
    RAISE EXCEPTION 'Invalid DPIA decision transition: % -> %', OLD.decision, NEW.decision;
  END IF;
  IF NEW.decision='APPROVED' THEN
    IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'Approved DPIA requires approval metadata';
    END IF;
    IF NEW.approved_by = NEW.created_by THEN
      RAISE EXCEPTION 'DPIA creator cannot approve the same DPIA';
    END IF;
    IF nullif(btrim(coalesce(NEW.risk_summary,'')),'') IS NULL OR nullif(btrim(coalesce(NEW.mitigation_summary,'')),'') IS NULL THEN
      RAISE EXCEPTION 'Approved DPIA requires risk and mitigation summaries';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dpia_decision_transition_guard
BEFORE UPDATE OF decision, approved_by, approved_at ON dpia_assessments
FOR EACH ROW EXECUTE FUNCTION enforce_dpia_decision_transition();

CREATE OR REPLACE FUNCTION enforce_processor_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status='PROSPECTIVE' AND NEW.status IN ('ACTIVE','TERMINATED')) OR
    (OLD.status='ACTIVE' AND NEW.status IN ('SUSPENDED','TERMINATED')) OR
    (OLD.status='SUSPENDED' AND NEW.status IN ('ACTIVE','TERMINATED'))
  ) THEN RAISE EXCEPTION 'Invalid processor transition: % -> %', OLD.status, NEW.status; END IF;

  IF NEW.status='ACTIVE' THEN
    IF nullif(btrim(coalesce(NEW.contract_reference,'')),'') IS NULL OR
       nullif(btrim(coalesce(NEW.dpa_reference,'')),'') IS NULL OR
       upper(coalesce(NEW.security_review_status,'')) <> 'APPROVED' OR
       NEW.due_diligence_completed_at IS NULL OR NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'Active processor requires contract, DPA, approved security review, due diligence and approval metadata';
    END IF;
    IF NEW.approved_by = NEW.created_by THEN
      RAISE EXCEPTION 'Processor creator cannot approve activation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER processors_status_transition_guard
BEFORE UPDATE OF status, approved_by, approved_at, due_diligence_completed_at ON processors
FOR EACH ROW EXECUTE FUNCTION enforce_processor_status_transition();

CREATE OR REPLACE FUNCTION enforce_transfer_state_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = NEW.state THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.state='DRAFT' AND NEW.state IN ('UNDER_REVIEW','ARCHIVED')) OR
    (OLD.state='UNDER_REVIEW' AND NEW.state IN ('ACTIVE','DRAFT','ARCHIVED')) OR
    (OLD.state='ACTIVE' AND NEW.state IN ('UNDER_REVIEW','CLOSED','ARCHIVED')) OR
    (OLD.state='CLOSED' AND NEW.state='ARCHIVED')
  ) THEN RAISE EXCEPTION 'Invalid transfer transition: % -> %', OLD.state, NEW.state; END IF;

  IF NEW.state='ACTIVE' THEN
    IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'Active transfer requires approval metadata';
    END IF;
    IF NEW.approved_by = NEW.created_by THEN
      RAISE EXCEPTION 'Transfer creator cannot approve activation';
    END IF;
    IF NEW.mechanism='OTHER' AND nullif(btrim(coalesce(NEW.mechanism_reference,'')),'') IS NULL THEN
      RAISE EXCEPTION 'OTHER transfer mechanism requires mechanism reference';
    END IF;
    IF NEW.mechanism IN ('SCC','BCR','DEROGATION','OTHER') AND nullif(btrim(coalesce(NEW.transfer_risk_assessment_reference,'')),'') IS NULL THEN
      RAISE EXCEPTION 'Transfer mechanism % requires a transfer risk assessment reference', NEW.mechanism;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER international_transfers_state_guard
BEFORE UPDATE OF state, approved_by, approved_at ON international_transfers
FOR EACH ROW EXECUTE FUNCTION enforce_transfer_state_transition();

CREATE OR REPLACE FUNCTION enforce_dsr_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status='RECEIVED' AND NEW.status IN ('IDENTITY_VERIFICATION','REJECTED','CANCELLED')) OR
    (OLD.status='IDENTITY_VERIFICATION' AND NEW.status IN ('IN_PROGRESS','REJECTED','CANCELLED')) OR
    (OLD.status='IN_PROGRESS' AND NEW.status IN ('ON_HOLD','COMPLETED','REJECTED','CANCELLED')) OR
    (OLD.status='ON_HOLD' AND NEW.status IN ('IN_PROGRESS','REJECTED','CANCELLED'))
  ) THEN RAISE EXCEPTION 'Invalid DSR transition: % -> %', OLD.status, NEW.status; END IF;

  IF NEW.status IN ('IN_PROGRESS','ON_HOLD','COMPLETED') AND NEW.identity_verified_at IS NULL THEN
    RAISE EXCEPTION 'DSR status % requires identity verification', NEW.status;
  END IF;
  IF NEW.status='COMPLETED' AND (nullif(btrim(coalesce(NEW.outcome,'')),'') IS NULL OR NEW.closed_at IS NULL) THEN
    RAISE EXCEPTION 'Completed DSR requires outcome and closed_at';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER data_subject_requests_status_guard
BEFORE UPDATE OF status, identity_verified_at, outcome, closed_at ON data_subject_requests
FOR EACH ROW EXECUTE FUNCTION enforce_dsr_status_transition();

CREATE OR REPLACE FUNCTION dsr_is_overdue(candidate_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM data_subject_requests d
    WHERE d.id=candidate_id
      AND d.due_at IS NOT NULL
      AND d.due_at < now()
      AND d.status NOT IN ('COMPLETED','REJECTED','CANCELLED')
  );
$$;

CREATE OR REPLACE FUNCTION enforce_breach_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status='DETECTED' AND NEW.status='TRIAGE') OR
    (OLD.status='TRIAGE' AND NEW.status='INVESTIGATING') OR
    (OLD.status='INVESTIGATING' AND NEW.status IN ('CONTAINED','NOTIFICATION_ASSESSMENT')) OR
    (OLD.status='CONTAINED' AND NEW.status='NOTIFICATION_ASSESSMENT') OR
    (OLD.status='NOTIFICATION_ASSESSMENT' AND NEW.status IN ('NOTIFIED','CLOSED')) OR
    (OLD.status='NOTIFIED' AND NEW.status='CLOSED')
  ) THEN RAISE EXCEPTION 'Invalid privacy breach transition: % -> %', OLD.status, NEW.status; END IF;

  IF NEW.status IN ('CONTAINED','NOTIFICATION_ASSESSMENT','NOTIFIED','CLOSED') AND nullif(btrim(coalesce(NEW.containment_summary,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Breach status % requires containment summary', NEW.status;
  END IF;
  IF NEW.status IN ('NOTIFICATION_ASSESSMENT','NOTIFIED','CLOSED') AND NEW.notification_required IS NULL THEN
    RAISE EXCEPTION 'Breach notification decision is required';
  END IF;
  IF NEW.status='NOTIFIED' AND NEW.notification_required IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'NOTIFIED status requires notification_required=true';
  END IF;
  IF NEW.status='NOTIFIED' AND NEW.authority_notified_at IS NULL AND NEW.subjects_notified_at IS NULL THEN
    RAISE EXCEPTION 'NOTIFIED status requires an authority or subject notification timestamp';
  END IF;
  IF NEW.status='CLOSED' AND NEW.notification_required=true AND NEW.authority_notified_at IS NULL AND NEW.subjects_notified_at IS NULL THEN
    RAISE EXCEPTION 'Notifiable breach cannot close without notification timestamp';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER privacy_breaches_status_guard
BEFORE UPDATE OF status, containment_summary, notification_required, authority_notified_at, subjects_notified_at ON privacy_breaches
FOR EACH ROW EXECUTE FUNCTION enforce_breach_status_transition();

COMMENT ON FUNCTION dsr_is_overdue(uuid) IS 'Deterministic overdue predicate for non-terminal DSRs with a due date in the past.';
