-- ═══════════════════════════════════════════════════════════════════════════
-- Zero to Strong — New Tables (Phase 2)
-- Run this in the Supabase SQL Editor after the original supabase-setup.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Goals ───────────────────────────────────────────────────────────────────
-- type: 'weight' | 'strength' | 'frequency' | 'nutrition'
-- For weight:    target_value = target kg, target_date = deadline
-- For strength:  target_value = target kg/reps/distance, exercise_name required
-- For frequency: target_value = sessions per week
-- For nutrition: target_value = daily kcal target

CREATE TABLE IF NOT EXISTS goals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type           text NOT NULL CHECK (type IN ('weight', 'strength', 'frequency', 'nutrition')),
  target_value   numeric NOT NULL,
  target_date    date,
  exercise_name  text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goals_select_own" ON goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "goals_insert_own" ON goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "goals_update_own" ON goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "goals_delete_own" ON goals FOR DELETE USING (auth.uid() = user_id);

-- ─── Workout Schedule ─────────────────────────────────────────────────────────
-- day_of_week: 0=Sunday, 1=Monday, ..., 6=Saturday
-- template_id NULL = rest day

CREATE TABLE IF NOT EXISTS workout_schedule (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week  integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  template_id  uuid REFERENCES workout_templates(id) ON DELETE SET NULL,
  UNIQUE(user_id, day_of_week)
);

ALTER TABLE workout_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_select_own" ON workout_schedule FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "schedule_insert_own" ON workout_schedule FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "schedule_update_own" ON workout_schedule FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "schedule_delete_own" ON workout_schedule FOR DELETE USING (auth.uid() = user_id);

-- ─── Weight Logs ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS weight_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       date NOT NULL DEFAULT CURRENT_DATE,
  weight     numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weight_select_own" ON weight_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "weight_insert_own" ON weight_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "weight_update_own" ON weight_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "weight_delete_own" ON weight_logs FOR DELETE USING (auth.uid() = user_id);

-- ─── Nutrition Logs ───────────────────────────────────────────────────────────
-- entries JSONB: [{ description: string, kcal: number }]

CREATE TABLE IF NOT EXISTS nutrition_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       date NOT NULL DEFAULT CURRENT_DATE,
  entries    jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE nutrition_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutrition_select_own" ON nutrition_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "nutrition_insert_own" ON nutrition_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nutrition_update_own" ON nutrition_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "nutrition_delete_own" ON nutrition_logs FOR DELETE USING (auth.uid() = user_id);
