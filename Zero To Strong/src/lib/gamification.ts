import type { UserStats, PersonalBest, WorkoutSession, ExerciseLog } from './types';

// ─── Levels ───────────────────────────────────────────────────────────────────

export const LEVEL_THRESHOLDS = [0, 1000, 3000, 7000, 15000, 30000, 60000, 100000, 150000, 200000];

export const LEVEL_NAMES = [
  '', // 0 unused
  'Beginner',
  'Consistent',
  'Committed',
  'Dedicated',
  'Relentless',
  'Elite',
  'Legend',
  'Champion',
  'Immortal',
  'GOD MODE',
];

export function computeLevel(totalPoints: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalPoints >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

export function levelProgress(totalPoints: number): { level: number; name: string; current: number; needed: number; pct: number } {
  const level = computeLevel(totalPoints);
  const thresholdIdx = level - 1;
  const current = totalPoints - LEVEL_THRESHOLDS[thresholdIdx];
  const nextThreshold = LEVEL_THRESHOLDS[thresholdIdx + 1];
  const needed = nextThreshold != null ? nextThreshold - LEVEL_THRESHOLDS[thresholdIdx] : null;
  const pct = needed != null ? Math.min(100, Math.round((current / needed) * 100)) : 100;
  return { level, name: LEVEL_NAMES[level] ?? `Level ${level}`, current, needed: needed ?? current, pct };
}

// ─── Achievement definitions ──────────────────────────────────────────────────

export interface AchievementDef {
  key: string;
  label: string;
  description: string;
  bonusPoints: number;
  icon: string;
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // Workouts
  { key: 'first_workout',  label: 'First Sweat',   description: 'Complete your first workout',       bonusPoints: 50,   icon: '🏋️' },
  { key: 'workouts_10',    label: 'Dedicated',      description: 'Complete 10 workouts',              bonusPoints: 200,  icon: '💪' },
  { key: 'workouts_50',    label: 'Committed',      description: 'Complete 50 workouts',              bonusPoints: 500,  icon: '🔥' },
  { key: 'workouts_100',   label: 'Elite',          description: 'Complete 100 workouts',             bonusPoints: 1000, icon: '🏆' },
  // Streaks
  { key: 'streak_1',       label: 'Day One',        description: 'Log in for the first day',          bonusPoints: 10,   icon: '✅' },
  { key: 'streak_3',       label: 'Warming Up',     description: '3-day activity streak',             bonusPoints: 50,   icon: '🌱' },
  { key: 'streak_7',       label: 'Locked In',      description: '7-day activity streak',             bonusPoints: 500,  icon: '⚡' },
  { key: 'streak_10',      label: 'Relentless',     description: '10-day activity streak',            bonusPoints: 200,  icon: '🎯' },
  { key: 'streak_14',      label: 'Fortnight',      description: '14-day activity streak',            bonusPoints: 400,  icon: '🗓️' },
  { key: 'streak_21',      label: 'Habit Built',    description: '21-day activity streak',            bonusPoints: 600,  icon: '🧠' },
  { key: 'streak_30',      label: 'Unstoppable',    description: '30-day activity streak',            bonusPoints: 1000, icon: '🚀' },
  // Nutrition
  { key: 'first_meal',     label: 'Fuelled',        description: 'Log your first meal',               bonusPoints: 30,   icon: '🥗' },
  { key: 'nutrition_7days',label: 'Clean Week',     description: 'Log nutrition for 7 days',          bonusPoints: 200,  icon: '🥦' },
  // Goals & weight
  { key: 'first_goal',     label: 'Goal Setter',    description: 'Set your first goal',               bonusPoints: 50,   icon: '🎯' },
  { key: 'weight_logged_10',label: 'Accountable',   description: 'Log your weight 10 times',          bonusPoints: 100,  icon: '⚖️' },
  { key: 'weight_goal_reached', label: 'Target Hit',description: 'Reach your body weight goal',       bonusPoints: 500,  icon: '🎊' },
  // Personal bests
  { key: 'first_pb',           label: 'New Record',      description: 'Set your first personal best',   bonusPoints: 100,  icon: '📈' },
  { key: 'fastest_workout',    label: 'Speed Run',       description: 'Set a new fastest workout time', bonusPoints: 100,  icon: '⏱️' },
  // Onboarding
  { key: 'onboarding_complete', label: 'Ready to Go',    description: 'Complete your profile setup',    bonusPoints: 100,  icon: '🎉' },
];

export const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENT_DEFS.map((d) => [d.key, d]));

// Generate streak achievement keys every 7 days after 30
export function getStreakAchievementKey(streak: number): string | null {
  const STREAK_MILESTONES = [1, 3, 7, 10, 14, 21, 30];
  if (STREAK_MILESTONES.includes(streak)) return `streak_${streak}`;
  if (streak > 30 && (streak - 30) % 7 === 0) return `streak_${streak}`;
  return null;
}

// For streaks > 30 that aren't in ACHIEVEMENT_DEFS, generate an ad-hoc def
export function getStreakDef(streak: number): AchievementDef {
  const existing = ACHIEVEMENT_MAP[`streak_${streak}`];
  if (existing) return existing;
  return {
    key: `streak_${streak}`,
    label: `${streak}-Day Streak`,
    description: `${streak}-day activity streak`,
    bonusPoints: 200,
    icon: '🔥',
  };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

export function getISOWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; // Mon=1 ... Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ─── Activity / streak ────────────────────────────────────────────────────────

export interface ActivityResult {
  updatedStats: UserStats;
  pointsAwarded: number;
  newAchievementKeys: string[];
}

export function processActivity(
  stats: UserStats,
  unlockedKeys: Set<string>
): ActivityResult {
  const today = getTodayKey();
  if (stats.lastActiveDate === today) {
    return { updatedStats: stats, pointsAwarded: 0, newAchievementKeys: [] };
  }

  const isConsecutive = stats.lastActiveDate === yesterdayKey();
  const newStreak = isConsecutive ? stats.streakDays + 1 : 1;
  const longestStreak = Math.max(stats.longestStreak, newStreak);

  const newAchievementKeys: string[] = [];
  const streakKey = getStreakAchievementKey(newStreak);
  if (streakKey && !unlockedKeys.has(streakKey)) {
    newAchievementKeys.push(streakKey);
  }

  const pointsAwarded = 10; // login bonus
  const bonusPoints = newAchievementKeys.reduce((sum, k) => {
    const def = ACHIEVEMENT_MAP[k] ?? getStreakDef(newStreak);
    return sum + def.bonusPoints;
  }, 0);

  const updatedStats: UserStats = {
    ...stats,
    totalPoints: stats.totalPoints + pointsAwarded + bonusPoints,
    streakDays: newStreak,
    longestStreak,
    lastActiveDate: today,
  };

  return { updatedStats, pointsAwarded, newAchievementKeys };
}

// ─── Point award helpers ──────────────────────────────────────────────────────

/** Award workout points (+100). Always allowed (one per session). */
export function awardWorkoutPoints(stats: UserStats): UserStats {
  return { ...stats, totalPoints: stats.totalPoints + 100 };
}

/** Award nutrition points (+50). Once per day. Returns null if already awarded today. */
export function awardNutritionPoints(stats: UserStats): UserStats | null {
  const today = getTodayKey();
  if (stats.lastNutritionPointsDate === today) return null;
  return { ...stats, totalPoints: stats.totalPoints + 50, lastNutritionPointsDate: today };
}

/** Award weight points (+50). Once per ISO week. Returns null if already awarded this week. */
export function awardWeightPoints(stats: UserStats): UserStats | null {
  const week = getISOWeekKey();
  if (stats.lastWeightPointsWeek === week) return null;
  return { ...stats, totalPoints: stats.totalPoints + 50, lastWeightPointsWeek: week };
}

/** Award bonus points for an achievement unlock. */
export function awardAchievementBonus(stats: UserStats, bonusPoints: number): UserStats {
  return { ...stats, totalPoints: stats.totalPoints + bonusPoints };
}

// ─── Achievement checks ───────────────────────────────────────────────────────

export interface AchievementContext {
  totalWorkouts?: number;
  totalWeightLogs?: number;
  totalNutritionDays?: number;
  totalGoals?: number;
  isNewPB?: boolean;
  isNewFastestWorkout?: boolean;
  currentWeightKg?: number;
  weightGoalKg?: number;
}

export function checkAchievements(
  context: AchievementContext,
  unlockedKeys: Set<string>
): string[] {
  const newKeys: string[] = [];

  function maybeUnlock(key: string) {
    if (!unlockedKeys.has(key)) newKeys.push(key);
  }

  const { totalWorkouts, totalWeightLogs, totalNutritionDays, totalGoals, isNewPB, isNewFastestWorkout, currentWeightKg, weightGoalKg } = context;

  if (totalWorkouts != null) {
    if (totalWorkouts >= 1)   maybeUnlock('first_workout');
    if (totalWorkouts >= 10)  maybeUnlock('workouts_10');
    if (totalWorkouts >= 50)  maybeUnlock('workouts_50');
    if (totalWorkouts >= 100) maybeUnlock('workouts_100');
  }
  if (totalWeightLogs != null) {
    if (totalWeightLogs >= 1)  maybeUnlock('first_goal'); // weight log implies first engagement
    if (totalWeightLogs >= 10) maybeUnlock('weight_logged_10');
  }
  if (totalNutritionDays != null) {
    if (totalNutritionDays >= 1) maybeUnlock('first_meal');
    if (totalNutritionDays >= 7) maybeUnlock('nutrition_7days');
  }
  if (totalGoals != null && totalGoals >= 1) maybeUnlock('first_goal');
  if (isNewPB) maybeUnlock('first_pb');
  if (isNewFastestWorkout) maybeUnlock('fastest_workout');
  if (currentWeightKg != null && weightGoalKg != null && currentWeightKg <= weightGoalKg) {
    maybeUnlock('weight_goal_reached');
  }

  return newKeys;
}

// ─── Personal best computation ────────────────────────────────────────────────

export function computePersonalBestUpdates(
  session: WorkoutSession,
  existingPBs: PersonalBest[]
): { updates: Omit<PersonalBest, 'id' | 'userId' | 'recordedAt'>[]; isNewRecord: boolean } {
  const pbMap = new Map<string, PersonalBest>();
  for (const pb of existingPBs) {
    pbMap.set(`${pb.exerciseName}::${pb.trackingType}`, pb);
  }

  const updates: Omit<PersonalBest, 'id' | 'userId' | 'recordedAt'>[] = [];
  let isNewRecord = false;

  for (const ex of session.exercises) {
    const key = `${ex.exerciseName}::${ex.trackingType}`;
    const existing = pbMap.get(key);
    const update = computeExercisePB(ex, existing);
    if (update.changed) {
      isNewRecord = true;
      updates.push(update.pb);
    }
  }

  // Check fastest workout
  if (session.durationSeconds != null) {
    // Handled separately in the caller (updates user_stats.fastest_workout_s)
  }

  return { updates, isNewRecord };
}

function computeExercisePB(
  ex: ExerciseLog,
  existing: PersonalBest | undefined
): { pb: Omit<PersonalBest, 'id' | 'userId' | 'recordedAt'>; changed: boolean } {
  let bestReps = existing?.bestReps ?? null;
  let bestWeightKg = existing?.bestWeightKg ?? null;
  let bestDurationS = existing?.bestDurationS ?? null;
  let bestDistanceM = existing?.bestDistanceM ?? null;
  let bestPaceMs = existing?.bestPaceMs ?? null;
  let bestRepsPerS = existing?.bestRepsPerS ?? null;
  let totalReps = existing?.totalReps ?? 0;
  let changed = false;

  for (const set of ex.sets) {
    if (ex.trackingType === 'reps_weight') {
      const s = set as { reps: number; weight: number };
      totalReps += s.reps ?? 0;
      if (bestReps == null || s.reps > bestReps) { bestReps = s.reps; changed = true; }
      if (bestWeightKg == null || s.weight > bestWeightKg) { bestWeightKg = s.weight; changed = true; }
    } else if (ex.trackingType === 'duration') {
      const s = set as { time: number };
      if (bestDurationS == null || s.time > bestDurationS) { bestDurationS = s.time; changed = true; }
    } else if (ex.trackingType === 'distance_time') {
      const s = set as { distance: number; time: number };
      if (bestDistanceM == null || s.distance > bestDistanceM) { bestDistanceM = s.distance; changed = true; }
      const pace = s.time > 0 ? s.distance / s.time : 0;
      if (bestPaceMs == null || pace > bestPaceMs) { bestPaceMs = pace; changed = true; }
    } else if (ex.trackingType === 'bodyweight_reps') {
      const s = set as { reps: number; setDurationSeconds?: number };
      totalReps += s.reps ?? 0;
      if (bestReps == null || s.reps > bestReps) { bestReps = s.reps; changed = true; }
      if (s.setDurationSeconds && s.setDurationSeconds > 0) {
        const rps = s.reps / s.setDurationSeconds;
        if (bestRepsPerS == null || rps > bestRepsPerS) { bestRepsPerS = rps; changed = true; }
      }
    }
  }

  // Also count as changed if totalReps grew (for volume milestones)
  if (totalReps > (existing?.totalReps ?? 0)) changed = true;

  return {
    changed,
    pb: {
      exerciseName: ex.exerciseName,
      trackingType: ex.trackingType,
      bestReps,
      bestWeightKg,
      bestDurationS,
      bestDistanceM,
      bestPaceMs,
      bestRepsPerS,
      totalReps,
    },
  };
}
