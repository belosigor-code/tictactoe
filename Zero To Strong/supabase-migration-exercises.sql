-- ─── Exercise Library ──────────────────────────────────────────────────────────
-- Global per-user exercise list, separate from workout templates.
-- tracking_type drives how personal bests are tracked.

CREATE TABLE IF NOT EXISTS exercises (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  tracking_type text NOT NULL CHECK (tracking_type IN ('duration', 'reps_weight', 'distance_time', 'bodyweight_reps')),
  default_sets  integer NOT NULL DEFAULT 3,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exercises_select_own" ON exercises FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "exercises_insert_own" ON exercises FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "exercises_update_own" ON exercises FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "exercises_delete_own" ON exercises FOR DELETE USING (auth.uid() = user_id);

-- ─── target_reps on goals ──────────────────────────────────────────────────────
-- Strength goals now store weight target and reps target separately.
-- target_value = target weight (kg), 0 for bodyweight exercises
-- target_reps  = target reps (null for non-reps goals)

ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_reps integer;
