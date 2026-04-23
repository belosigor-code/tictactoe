-- Allow multiple workouts per day in the weekly schedule.
-- Run this once in your Supabase SQL editor.

ALTER TABLE workout_schedule
  DROP CONSTRAINT IF EXISTS workout_schedule_user_id_day_of_week_key;
