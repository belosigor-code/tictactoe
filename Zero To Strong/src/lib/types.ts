export type TrackingType = 'duration' | 'reps_weight' | 'distance_time' | 'bodyweight_reps';

export interface ExerciseTemplate {
  id: string;
  name: string;
  sets: number; // 1–10
  trackingType: TrackingType;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: ExerciseTemplate[];
  mode?: 'linear' | 'circular'; // defaults to 'linear'
}

export interface DurationSetLog {
  time: number; // seconds, e.g. 45.2
  setDurationSeconds?: number;
}

export interface RepsWeightSetLog {
  reps: number;
  weight: number; // kg
  setDurationSeconds?: number;
}

export interface DistanceTimeSetLog {
  distance: number; // meters
  time: number; // seconds
  setDurationSeconds?: number;
}

export interface BodyweightRepsSetLog {
  reps: number;
  setDurationSeconds?: number;
}

export type SetLog = DurationSetLog | RepsWeightSetLog | DistanceTimeSetLog | BodyweightRepsSetLog;

export interface ExerciseLog {
  exerciseId: string;
  exerciseName: string;
  trackingType: TrackingType;
  sets: SetLog[];
}

export interface WorkoutSession {
  id: string;
  date: string; // ISO timestamp
  workoutTemplateId: string;
  workoutName: string;
  exercises: ExerciseLog[];
  durationSeconds?: number;
}

export interface UserProfile {
  id: string;
  userId: string;
  username: string;
  onboardingCompleted: boolean;
}

export interface UserStats {
  userId: string;
  totalPoints: number;
  streakDays: number;
  longestStreak: number;
  lastActiveDate: string | null;
  lastWeightPointsWeek: string | null;
  lastNutritionPointsDate: string | null;
  fastestWorkoutS: number | null;
}

export interface Achievement {
  id: string;
  userId: string;
  achievementKey: string;
  unlockedAt: string;
  bonusPoints: number;
}

export interface PersonalBest {
  id: string;
  userId: string;
  exerciseName: string;
  trackingType: TrackingType;
  bestReps: number | null;
  bestWeightKg: number | null;
  bestDurationS: number | null;
  bestDistanceM: number | null;
  bestPaceMs: number | null;
  bestRepsPerS: number | null;
  totalReps: number;
  recordedAt: string;
}

// ─── New types ────────────────────────────────────────────────────────────────

export type GoalType = 'weight' | 'strength' | 'frequency' | 'nutrition';

export interface Goal {
  id: string;
  userId: string;
  type: GoalType;
  targetValue: number;
  targetReps?: number;  // for strength goals: target reps (targetValue = target weight kg, 0 if bodyweight)
  targetDate?: string; // ISO date string e.g. '2025-12-31'
  exerciseName?: string; // for strength goals
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Exercise Library ─────────────────────────────────────────────────────────

export interface Exercise {
  id: string;
  userId: string;
  name: string;
  trackingType: TrackingType;
  defaultSets: number;
  createdAt: string;
}

// day_of_week: 0=Sunday, 1=Monday, ..., 6=Saturday
export interface ScheduleEntry {
  id: string;
  userId: string;
  dayOfWeek: number;
  templateId: string | null; // null = rest day
  templateName?: string; // joined from workout_templates
}

export interface WeightLog {
  id: string;
  userId: string;
  date: string; // ISO date string e.g. '2025-01-05'
  weight: number; // kg
}

export interface NutritionEntry {
  description?: string;
  kcal: number;
  protein?: number; // grams
  carbs?: number;   // grams
  fat?: number;     // grams
}

export interface NutritionMeal {
  id: string;
  name: string; // e.g. 'Breakfast', 'Lunch', 'Dinner', 'Snacks', or custom
  entries: NutritionEntry[];
}

export interface NutritionLog {
  id: string;
  userId: string;
  date: string; // ISO date string
  meals: NutritionMeal[];
}
