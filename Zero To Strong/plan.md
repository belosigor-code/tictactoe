# Plan

## Goal
Expand Zero to Strong with: Home dashboard, Nutrition tab, workout scheduling, goal setting, weight logging, and a Profile tab. Restructure navigation to 5 tabs.

---

## Navigation (new structure)
| Tab | Content |
|---|---|
| Home | Dashboard: goals, consistency, today's workout, today's calories, current weight |
| Workouts | Templates + schedule + session history (as before) |
| Nutrition | Daily calorie log + nutrition history + calorie goal |
| Progress | Per-exercise charts + weight trend chart |
| Profile | Goals, workout schedule, account settings |

---

## New Features

### 1. Goals (Profile tab)
- One active goal per type: weight, strength, frequency
- **Weight goal**: target weight (kg) + target date → "You're at 75kg, 5kg to go in 105 days!"
- **Strength goal**: exercise name + target weight (kg)/ traget distance/ target reps + target date 
- **Frequency goal**: target sessions per week
- Stored in a `goals` table in Supabase

### 2. Workout Schedule (Profile tab)
- Assign existing workout templates to days of the week (Mon–Sun)
- Days without a template = rest days
- Stored in a `workout_schedule` table (user_id, day_of_week 0–6, template_id)
- Home tab reads today's scheduled workout and displays it

### 3. Weight Logging
- Simple log: date + weight (kg)
- User can log once per day (or update)
- Stored in `weight_logs` table
- Progress tab shows weight trend chart alongside exercise charts
- Home tab shows latest logged weight

### 4. Nutrition Tab
- **Goal**: daily calorie target (set in Profile)
- **Log**: add entries for the day (description + kcal) — e.g. "Breakfast: 600 kcal"
- **History**: past days shown in reverse-chronological accordion (same pattern as workout history)
- Stored in `nutrition_logs` table (user_id, date, entries JSONB)
- Home tab shows today's total vs goal

### 5. Home Dashboard
Widgets (top to bottom):
1. **Goal progress** — active goals with progress bar and countdown message
2. **Consistency strip** — 7 day view (Mon–Sun), each day shows workout logged ✓ or rest/missed
3. **Today's workout** — scheduled template name with START button, or "REST DAY"
4. **Today's calories** — X / Y kcal progress bar
5. **Current weight** — latest logged weight with quick-log button

---

## Database changes (new tables)

```sql
-- Goals
CREATE TABLE goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  type text NOT NULL, -- 'weight' | 'strength' | 'frequency'
  target_value numeric NOT NULL,
  target_date date,
  exercise_name text, -- for strength goals
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Workout schedule
CREATE TABLE workout_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  day_of_week integer NOT NULL, -- 0=Sun, 1=Mon ... 6=Sat
  template_id uuid REFERENCES workout_templates ON DELETE SET NULL,
  UNIQUE(user_id, day_of_week)
);

-- Weight logs
CREATE TABLE weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  weight numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Nutrition logs
CREATE TABLE nutrition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  entries jsonb NOT NULL DEFAULT '[]', -- [{description, kcal}]
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Nutrition goal (stored as a goal row with type='nutrition')
-- target_value = daily kcal target
```

---

## Files to create / modify

### New files
- `src/components/HomeView.tsx` — dashboard
- `src/components/NutritionView.tsx` — calorie log + history
- `src/components/ProfileView.tsx` — goals + schedule + account

### Modified files
- `src/pages/Index.tsx` — 5-tab navigation, add Home/Nutrition/Profile tabs
- `src/lib/types.ts` — add Goal, WeightLog, NutritionLog, NutritionEntry types
- `src/lib/storage.ts` — add DB functions for all new tables
- `supabase-setup.sql` — append new table SQL

### Removed
- `src/components/HistoryView.tsx` — history moves into WorkoutDashboard as a sub-screen

---

## Progress
- [ ] Add new Supabase tables (SQL)
- [ ] Update types.ts
- [ ] Update storage.ts
- [ ] Build ProfileView (goals + schedule)
- [ ] Build NutritionView (log + history)
- [ ] Build HomeView (dashboard)
- [ ] Update Index.tsx (5-tab nav, wire everything)
- [ ] Deploy to Vercel
