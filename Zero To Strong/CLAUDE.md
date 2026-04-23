# Zero to Strong — Claude Code Guide

## Project Overview
Mobile-first fitness tracking web app. Users create workout templates with exercises, log live workout sessions with timers, view history, and track progress via charts. Dark theme only, orange accent, brutalist design.

## Tech Stack
- **Vite + React 18 + TypeScript**
- **Tailwind CSS v3** — dark theme via HSL CSS variables in `index.css`
- **shadcn/ui** — Radix UI primitives; add components with `npx shadcn@latest add <component>`
- **Supabase** — Auth + PostgreSQL + RLS. Credentials in `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- **Recharts** — LineChart for progress view
- **React Router v6** — single route `/`, all navigation via React state (not URL routes)
- **sonner** — toast notifications

## Common Commands
```bash
npm run dev       # start dev server (http://localhost:5173)
npm run build     # production build
npm run preview   # preview production build
```

## Architecture

### Navigation
All navigation is managed in `src/pages/Index.tsx` via two state variables:
- `tab`: `'workouts' | 'history' | 'progress'`
- `screen`: `'dashboard' | 'detail' | 'active'`

Current nav state is persisted to `sessionStorage` under key `zts-navigation-state`.

### Layout (Index.tsx)
```
Sticky header (username + logout)
Scrollable content area
Fixed bottom tab bar
Fixed workout control bar (only when session is active, above tab bar)
```

### Data Flow
- All DB ops go through `src/lib/storage.ts` (thin Supabase abstraction)
- `withTimeout(promise, ms)` helper wraps all network calls
- Templates: immediate persistence (no save button)
- Sessions: written once on workout finish

### Database
3 tables — see `supabase-setup.sql` for full schema, RLS policies, and auth trigger.

### Key Files
- `src/lib/types.ts` — all TypeScript interfaces (ExerciseTemplate, WorkoutTemplate, WorkoutSession, SetLog variants)
- `src/lib/storage.ts` — all Supabase calls
- `src/components/WorkoutView.tsx` — most complex component (~600 lines); contains inline `ExerciseCard` and `SetRow` sub-components
- `src/index.css` — full design system (CSS variables, tap-scale utility, font-mono-timer)

### Tracking Types
Exercises have one of three tracking types:
- `duration` — timer-based sets (stored as seconds with 1 decimal)
- `reps_weight` — manual reps + weight (kg) input
- `distance_time` — timer + distance input

### Adding shadcn Components
```bash
npx shadcn@latest add <component-name>
```
Components land in `src/components/ui/`.
