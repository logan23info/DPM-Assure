-- Treat an exception or observation formalized into a finding as governed by that finding.
-- Unformalized open source items continue to block review readiness.

CREATE OR REPLACE FUNCTION engagement_review_ready(candidate_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXISTS (SELECT 1 FROM workpapers w WHERE w.engagement_id = candidate_engagement_id)
    AND NOT EXISTS (
      SELECT 1 FROM workpapers w
      WHERE w.engagement_id = candidate_engagement_id
        AND NOT EXISTS (
          SELECT 1 FROM reviews r
          WHERE r.engagement_id = candidate_engagement_id
            AND r.workpaper_id = w.id
            AND r.status = 'APPROVED'
            AND r.reviewed_at IS NOT NULL
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM exceptions x
      WHERE x.engagement_id = candidate_engagement_id
        AND x.status NOT IN ('CLOSED','CANCELLED')
        AND NOT EXISTS (
          SELECT 1 FROM findings f
          WHERE f.engagement_id = candidate_engagement_id
            AND f.exception_id = x.id
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM observations o
      WHERE o.engagement_id = candidate_engagement_id
        AND o.status NOT IN ('CLOSED','CANCELLED')
        AND NOT EXISTS (
          SELECT 1 FROM findings f
          WHERE f.engagement_id = candidate_engagement_id
            AND f.observation_id = o.id
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM findings f
      WHERE f.engagement_id = candidate_engagement_id
        AND f.status <> 'CLOSED'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pbc_requests p
      WHERE p.engagement_id = candidate_engagement_id
        AND p.status NOT IN ('COMPLETED','CLOSED','CANCELLED')
    );
$$;

COMMENT ON FUNCTION engagement_review_ready(uuid) IS 'Review gate: all workpapers independently approved, no unformalized open source items, all findings closed, and no outstanding PBC requests.';
