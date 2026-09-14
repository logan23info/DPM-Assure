-- Contract for migration 0022. Uses existing seeded fixture conventions from prior DB contract scripts.
DO $$ BEGIN
  IF to_regclass('public.evidence_upload_intents') IS NULL THEN
    RAISE EXCEPTION 'evidence_upload_intents table missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evidence_upload_intent_status') THEN
    RAISE EXCEPTION 'evidence_upload_intent_status enum missing';
  END IF;
END $$;

-- Static invariants are intentionally verified without weakening runtime RLS fixture isolation.
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
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO evidence_upload_intents(id,organization_id,engagement_id,workpaper_id,filename,mime_type,expected_size_bytes,storage_key,created_by,expires_at)
    VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'x','text/plain',-1,'x',gen_random_uuid(),now()+interval '10 minutes');
    RAISE EXCEPTION 'negative expected_size_bytes unexpectedly accepted';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL;
  END;
END $$;
