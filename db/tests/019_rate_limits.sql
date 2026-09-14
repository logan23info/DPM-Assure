DO $$
DECLARE
  key char(64) := repeat('a',64)::char(64);
  first_allowed boolean;
  second_allowed boolean;
  third_allowed boolean;
BEGIN
  first_allowed := consume_rate_limit(key,2,3600);
  second_allowed := consume_rate_limit(key,2,3600);
  third_allowed := consume_rate_limit(key,2,3600);
  IF first_allowed IS DISTINCT FROM true OR second_allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'rate limiter rejected request before configured limit';
  END IF;
  IF third_allowed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'rate limiter failed to reject request above configured limit';
  END IF;
END $$;

DO $$ BEGIN
  BEGIN
    PERFORM consume_rate_limit(repeat('b',64)::char(64),0,60);
    RAISE EXCEPTION 'invalid max request configuration accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'invalid max request configuration accepted' THEN RAISE; END IF;
  END;
END $$;
