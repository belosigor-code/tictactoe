-- ═══════════════════════════════════════════════════════════════════════════
-- Zero to Strong — Supabase Setup
-- Run this in the Supabase SQL Editor (dashboard.supabase.com → SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username    text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workout_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  exercises   jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_template_id  uuid REFERENCES workout_templates(id) ON DELETE SET NULL,
  workout_name         text NOT NULL,
  date                 timestamptz NOT NULL DEFAULT now(),
  duration_seconds     integer,
  exercises            jsonb NOT NULL DEFAULT '[]',
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ─── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;

-- profiles: users can manage their own; anonymous can SELECT (for username check)
CREATE POLICY "profiles_select_all"   ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own"   ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update_own"   ON profiles FOR UPDATE USING (auth.uid() = user_id);

-- workout_templates: full CRUD own records
CREATE POLICY "templates_select_own"  ON workout_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "templates_insert_own"  ON workout_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "templates_update_own"  ON workout_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "templates_delete_own"  ON workout_templates FOR DELETE USING (auth.uid() = user_id);

-- workout_sessions: INSERT + SELECT own records (no update/delete)
CREATE POLICY "sessions_select_own"   ON workout_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sessions_insert_own"   ON workout_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─── Auth Trigger ────────────────────────────────────────────────────────────
-- Automatically creates a profile row when a new user signs up.
-- Reads the username from user_metadata (set during signUp options.data).

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (user_id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════════
-- Done! After running this:
-- 1. Go to Authentication → Settings → disable "Email confirmations" if you
--    want instant login during dev (re-enable for production).
-- 2. Copy your Project URL and anon key from Settings → API into .env.local
-- ═══════════════════════════════════════════════════════════════════════════
