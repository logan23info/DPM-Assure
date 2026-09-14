-- Contract for migration 0022. Static invariants avoid fabricating unrelated invalid tenant lineage.
DO $$ BEGIN
  IF to_regclass('public.evidence_upload_intents') IS NULL THEN
    RAISE EXCEPTION 'evidence_upload_intents table missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evidence_upload_intent_status') THEN
    RAISE EXCEPTION 'evidence_upload_intent_status enum missing';
  END IF;
END $$;

DO $$
DECLARE forced boolean;
BEGIN
  SELECT relforcerowsecurity INTO forced FROM pg_class WHERE oid='evidence_upload_intents'::regclass;
  IF forced IS DISTINCT FROM true THEN RAISE EXCEPTION 'evidence_upload_intents must FORCE RLS'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='evidence_upload_intents'::regclass AND tgname='trg_evidence_upload_intent_lineage' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'upload intent lineage trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='evidence_upload_intents'::regclass AND tgname='trg_protect_finalized_evidence_upload_intent' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'finalized upload intent immutability trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='evidence_upload_intents'::regclass AND tgname='evidence_upload_intents_frozen_guard' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'frozen engagement guard missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid='evidence_upload_intents'::regclass
      AND contype='c'
      AND pg_get_constraintdef(oid) ILIKE '%expected_size_bytes%>= 0%'
  ) THEN
    RAISE EXCEPTION 'non-negative expected evidence size constraint missing';
  END IF;
END $$;
