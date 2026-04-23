# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Mobile-first fitness tracking PWA branded "DAY 1". Users create workout templates, log live sessions with timers, track body weight and nutrition, and work toward primary goals (weight or strength). Dark theme only, lime-green (`#CCFF00`) accent, brutalist design language.

## Common Commands
```bash
npm run dev       # dev server at http://localhost:5173
npm run build     # tsc + vite build (run this to catch type errors)
npm run preview   # preview production build
```
No test runner is configured (playwright config exists but tests are stubs).

## Environment
`.env.local` requires:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Architecture

### Navigation model (`src/pages/Index.tsx`)
All navigation is pure React state — no URL routing beyond the single `/` route:
- `tab: 'home' | 'workouts' | 'nutrition' | 'progress' | 'profile'`
- `screen: 'dashboard' | 'detail' | 'active'` (only meaningful on the workouts tab)

State is persisted to `sessionStorage` under key `zts-navigation-state`. The browser back button is intercepted to go `detail → dashboard` rather than leaving the page.

Cross-tab navigation uses callback props (`onNavigateToProfile('goals')`, `onNavigateToProgress('history')`, etc.) passed down from Index into HomeView and other views. To deep-link to a section within a tab, Index holds separate scroll-target state (`profileScrollTarget`, `progressScrollTarget`) that each view consumes via a `scrollTarget` prop, scrolls to the ref, then calls `onScrollHandled()` to clear it.

### Workout timer
The global workout timer lives in Index. `timerState` is a `{ startTime, elapsedBeforePause, paused }` object. WorkoutView receives `getElapsedSeconds` as a callback. The stop-workout signal from the control bar to WorkoutView is sent via `document.dispatchEvent(new CustomEvent('zts:stop-workout'))`.

### Data layer (`src/lib/storage.ts`)
Single file for all Supabase calls. Every call is wrapped in `withTimeout(promise, 15000)`. Key patterns:
- Workout templates and their exercises are stored as a single row with `exercises: jsonb` — no separate exercises table for template exercises.
- Workout sessions store the full denormalised exercise/set log in `exercises: jsonb`.
- Personal bests are upserted keyed by `(user_id, exercise_name)` after each workout.
- The `exercises` table (separate from template exercises) is the user's global exercise library — populated automatically when strength goals are saved or exercises are added to workouts.

### Database migrations
SQL files are applied manually in the Supabase SQL Editor in this order:
1. `supabase-setup.sql` — core tables (profiles, workout_templates, workout_sessions)
2. `supabase-new-tables.sql` — goals, schedule_entries, weight_logs, nutrition_logs
3. `supabase-gamification.sql` — user_stats, achievements, personal_bests
4. `supabase-migration-multi-schedule.sql` — multi-workout-per-day schedule support
5. `supabase-migration-exercises.sql` — exercises library table + `target_reps` on goals

### Types (`src/lib/types.ts`)
All interfaces live here. Key ones:
- `ExerciseTemplate` — exercise inside a workout template (id, name, sets, trackingType)
- `WorkoutTemplate` — template with `exercises: ExerciseTemplate[]` and `mode: 'linear' | 'circular'`
- `WorkoutSession` — completed session with denormalised `exercises: ExerciseLog[]`
- `SetLog` — discriminated union: `DurationSetLog | RepsWeightSetLog | DistanceTimeSetLog | BodyweightRepsSetLog`
- `Goal` — `type`, `targetValue`, `targetReps?`, `exerciseName?`, `targetDate?`; weight and strength goals are mutually exclusive "primary goals"
- `Exercise` — global exercise library entry (separate from ExerciseTemplate)

### Tracking types
Four tracking types on exercises:
- `reps_weight` — reps + kg per set
- `bodyweight_reps` — reps only
- `duration` — timer-based (seconds with 1 decimal)
- `distance_time` — distance (meters) + timer

### Exercise autocomplete (`src/components/ExerciseCatalogInput.tsx`)
Reusable input used wherever an exercise name is entered (AddExerciseForm, GoalForm, OnboardingView). Merges user's own exercises (shown first with "Mine" badge) with the static catalog from `src/lib/exerciseCatalog.ts` (120 entries across Calisthenics, Weighted Training, Cardio, Stretching, Yoga). Fires `onSelect(CatalogEntry)` with defaults so callers can auto-fill tracking type and sets.

### Gamification (`src/lib/gamification.ts`)
Points, levels, streaks, and achievements. `processActivity(stats, unlockedKeys)` is called on every app load to handle streak logic and detect newly unlocked achievements. `ACHIEVEMENT_DEFS` is the static list; streak achievements are generated dynamically via `getStreakDef()`.

### Design system (`src/index.css`)
CSS variables define the full theme. Key custom utilities:
- `tap-scale` — `active:scale-95` touch feedback
- `glass-card` / `glass-nav` — frosted-glass dark panels
- `font-mono-timer` — monospaced font for timers and numbers
- `glow-primary` / `glow-primary-sm` / `text-glow-primary` — lime-green glow effects

### WorkoutView complexity
`src/components/WorkoutView.tsx` (~600 lines) contains inline sub-components `ExerciseCard` and `SetRow`. Circular workout mode cycles one set per exercise per round; linear mode does all sets of each exercise before moving on. Set timers per exercise are tracked in a `Record<string, TimerState>` keyed by exercise id.

### Key component responsibilities
- **HomeView** — dashboard tiles: consistency calendar (goal-timeline or monthly fallback), motivational panel, level strip, weekly progress, current weight, today's workout card
- **WorkoutDashboard** — workout template list (drag-to-reorder via dnd-kit) + exercise library section
- **WorkoutDetail** — edit template: mode toggle (linear/circular), drag-to-reorder exercises, add/edit/delete exercises
- **ProfileView** — goals (GoalForm with CustomDatePicker inline), schedule (per-day workout assignment), stats/achievements
- **OnboardingView** — 5-step flow: current weight → goal type → goal details → training frequency → calorie goal
