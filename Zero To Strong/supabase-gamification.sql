-- Gamification layer migration.
-- Run once in your Supabase SQL editor.

-- ─── Onboarding flag ─────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- ─── User stats ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_stats (
  user_id                    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_points               integer NOT NULL DEFAULT 0,
  streak_days                integer NOT NULL DEFAULT 0,
  longest_streak             integer NOT NULL DEFAULT 0,
  last_active_date           date,
  last_weight_points_week    text,         -- ISO week key e.g. '2026-W10'
  last_nutrition_points_date date,
  fastest_workout_s          integer,
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stats_own" ON user_stats
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Achievements ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS achievements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_key text NOT NULL,
  unlocked_at     timestamptz NOT NULL DEFAULT now(),
  bonus_points    integer NOT NULL DEFAULT 0,
  UNIQUE(user_id, achievement_key)
);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "achievements_own" ON achievements
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Personal bests ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS personal_bests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_name   text NOT NULL,
  tracking_type   text NOT NULL,
  best_reps       integer,
  best_weight_kg  numeric,
  best_duration_s numeric,
  best_distance_m numeric,
  best_pace_ms    numeric,       -- meters per second
  best_reps_per_s numeric,       -- for bodyweight_reps speed metric
  total_reps      integer NOT NULL DEFAULT 0,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, exercise_name, tracking_type)
);

ALTER TABLE personal_bests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pbs_own" ON personal_bests
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
