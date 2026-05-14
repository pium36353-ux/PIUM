-- ============================================================
-- activity_log table
-- Fire-and-forget event log for in-app actions (appointments
-- completed, reviews replied, drafts approved, etc.).
-- Written by src/lib/activityLog.js.
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text        NOT NULL,        -- es. 'service_added', 'review_replied'
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_business_id
  ON activity_log(business_id, created_at DESC);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_log: owner read"
  ON activity_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "activity_log: owner insert"
  ON activity_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "activity_log: admin read all"
  ON activity_log FOR SELECT
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
