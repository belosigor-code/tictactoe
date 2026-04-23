import { supabase } from '@/integrations/supabase/client';
import type {
  WorkoutTemplate,
  WorkoutSession,
  UserProfile,
  Goal,
  GoalType,
  ScheduleEntry,
  WeightLog,
  NutritionLog,
  NutritionMeal,
  UserStats,
  Achievement,
  PersonalBest,
  TrackingType,
  Exercise,
} from './types';

function withTimeout<T>(promise: Promise<T>, ms = 15000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), ms)
    ),
  ]);
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function registerUser(
  email: string,
  username: string,
  password: string
): Promise<{ sessionCreated: boolean }> {
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (existing) {
    throw new Error('Username already taken');
  }

  const { data, error } = await withTimeout(
    supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    })
  );

  if (error) throw error;
  return { sessionCreated: !!data.session };
}

export async function loginUser(email: string, password: string): Promise<void> {
  const { error } = await withTimeout(
    supabase.auth.signInWithPassword({ email, password })
  );
  if (error) throw error;
}

export async function logoutUser(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profile) {
    return {
      id: profile.id,
      userId: profile.user_id,
      username: profile.username,
      onboardingCompleted: profile.onboarding_completed ?? false,
    };
  }

  const username =
    (user.user_metadata?.username as string | undefined) ?? user.email ?? 'user';
  return { id: user.id, userId: user.id, username, onboardingCompleted: false };
}

export async function completeOnboarding(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('user_id', userId);
  if (error) throw error;
}

// ─── Workout Templates ───────────────────────────────────────────────────────

export async function getWorkoutTemplates(userId: string): Promise<WorkoutTemplate[]> {
  const { data, error } = await supabase
    .from('workout_templates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    exercises: row.exercises ?? [],
  }));
}

export async function saveWorkoutTemplate(
  userId: string,
  template: WorkoutTemplate
): Promise<void> {
  const { data: existing } = await supabase
    .from('workout_templates')
    .select('id')
    .eq('id', template.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('workout_templates')
      .update({
        name: template.name,
        exercises: template.exercises,
        updated_at: new Date().toISOString(),
      })
      .eq('id', template.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('workout_templates').insert({
      id: template.id,
      user_id: userId,
      name: template.name,
      exercises: template.exercises,
    });
    if (error) throw error;
  }
}

export async function deleteWorkoutTemplate(
  _userId: string,
  templateId: string
): Promise<void> {
  const { error } = await supabase
    .from('workout_templates')
    .delete()
    .eq('id', templateId);
  if (error) throw error;
}

// ─── Workout Sessions ────────────────────────────────────────────────────────

export async function getWorkoutSessions(userId: string): Promise<WorkoutSession[]> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    date: row.date,
    workoutTemplateId: row.workout_template_id ?? '',
    workoutName: row.workout_name,
    exercises: row.exercises ?? [],
    durationSeconds: row.duration_seconds ?? undefined,
  }));
}

export async function saveWorkoutSession(
  userId: string,
  session: WorkoutSession
): Promise<void> {
  const query = supabase.from('workout_sessions').insert({
    id: session.id,
    user_id: userId,
    workout_template_id: session.workoutTemplateId || null,
    workout_name: session.workoutName,
    date: session.date,
    duration_seconds: session.durationSeconds ?? null,
    exercises: session.exercises,
  });
  const { error } = await withTimeout(Promise.resolve(query));
  if (error) throw error;
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export async function getGoals(userId: string): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type as GoalType,
    targetValue: Number(row.target_value),
    targetReps: row.target_reps ?? undefined,
    targetDate: row.target_date ?? undefined,
    exerciseName: row.exercise_name ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function saveGoal(userId: string, goal: Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: userId,
      type: goal.type,
      target_value: goal.targetValue,
      target_reps: goal.targetReps ?? null,
      target_date: goal.targetDate ?? null,
      exercise_name: goal.exerciseName ?? null,
      notes: goal.notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    type: data.type as GoalType,
    targetValue: Number(data.target_value),
    targetReps: data.target_reps ?? undefined,
    targetDate: data.target_date ?? undefined,
    exerciseName: data.exercise_name ?? undefined,
    notes: data.notes ?? undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function updateGoal(goalId: string, updates: Partial<Pick<Goal, 'targetValue' | 'targetReps' | 'targetDate' | 'exerciseName' | 'notes'>>): Promise<void> {
  const { error } = await supabase
    .from('goals')
    .update({
      target_value: updates.targetValue,
      target_reps: updates.targetReps ?? null,
      target_date: updates.targetDate ?? null,
      exercise_name: updates.exerciseName ?? null,
      notes: updates.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId);
  if (error) throw error;
}

export async function deleteGoal(goalId: string): Promise<void> {
  const { error } = await supabase.from('goals').delete().eq('id', goalId);
  if (error) throw error;
}

// ─── Exercise Library ─────────────────────────────────────────────────────────

export async function getExercises(userId: string): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    trackingType: row.tracking_type as TrackingType,
    defaultSets: row.default_sets,
    createdAt: row.created_at,
  }));
}

export async function saveExercise(userId: string, exercise: Pick<Exercise, 'name' | 'trackingType' | 'defaultSets'>): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      user_id: userId,
      name: exercise.name,
      tracking_type: exercise.trackingType,
      default_sets: exercise.defaultSets,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    trackingType: data.tracking_type as TrackingType,
    defaultSets: data.default_sets,
    createdAt: data.created_at,
  };
}

export async function deleteExercise(exerciseId: string): Promise<void> {
  const { error } = await supabase.from('exercises').delete().eq('id', exerciseId);
  if (error) throw error;
}

// ─── Workout Schedule ────────────────────────────────────────────────────────

export async function getWorkoutSchedule(userId: string): Promise<ScheduleEntry[]> {
  const { data, error } = await supabase
    .from('workout_schedule')
    .select('*, workout_templates(name)')
    .eq('user_id', userId);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    dayOfWeek: row.day_of_week,
    templateId: row.template_id ?? null,
    templateName: (row.workout_templates as { name: string } | null)?.name,
  }));
}

export async function setScheduleDay(userId: string, dayOfWeek: number, templateId: string | null): Promise<void> {
  const { error } = await supabase
    .from('workout_schedule')
    .upsert(
      { user_id: userId, day_of_week: dayOfWeek, template_id: templateId },
      { onConflict: 'user_id,day_of_week' }
    );
  if (error) throw error;
}

export async function addScheduleEntry(userId: string, dayOfWeek: number, templateId: string): Promise<ScheduleEntry> {
  const { data, error } = await supabase
    .from('workout_schedule')
    .insert({ user_id: userId, day_of_week: dayOfWeek, template_id: templateId })
    .select('*, workout_templates(name)')
    .single();
  if (error) throw error;
  return {
    id: data.id,
    userId: data.user_id,
    dayOfWeek: data.day_of_week,
    templateId: data.template_id ?? null,
    templateName: (data.workout_templates as { name: string } | null)?.name,
  };
}

export async function removeScheduleEntry(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('workout_schedule')
    .delete()
    .eq('id', entryId);
  if (error) throw error;
}

export async function clearScheduleDay(userId: string, dayOfWeek: number): Promise<void> {
  const { error } = await supabase
    .from('workout_schedule')
    .delete()
    .eq('user_id', userId)
    .eq('day_of_week', dayOfWeek);
  if (error) throw error;
}

// ─── Weight Logs ─────────────────────────────────────────────────────────────

export async function getWeightLogs(userId: string): Promise<WeightLog[]> {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    date: row.date,
    weight: Number(row.weight),
  }));
}

export async function logWeight(userId: string, date: string, weight: number): Promise<void> {
  const { error } = await supabase
    .from('weight_logs')
    .upsert(
      { user_id: userId, date, weight },
      { onConflict: 'user_id,date' }
    );
  if (error) throw error;
}

// ─── Nutrition Logs ───────────────────────────────────────────────────────────

/** Converts old flat NutritionEntry[] format to NutritionMeal[] */
function parseMeals(raw: unknown): NutritionMeal[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  // Old format: array of { kcal, description } with no sub-entries array
  if (typeof raw[0].kcal === 'number' && !Array.isArray(raw[0].entries)) {
    return [{ id: crypto.randomUUID(), name: 'General', entries: raw }];
  }
  return raw as NutritionMeal[];
}

export async function getNutritionLogs(userId: string): Promise<NutritionLog[]> {
  const { data, error } = await supabase
    .from('nutrition_logs')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    date: row.date,
    meals: parseMeals(row.entries),
  }));
}

export async function getNutritionLogForDate(userId: string, date: string): Promise<NutritionLog | null> {
  const { data, error } = await supabase
    .from('nutrition_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    date: data.date,
    meals: parseMeals(data.entries),
  };
}

export async function saveNutritionLog(userId: string, date: string, meals: NutritionMeal[]): Promise<void> {
  const { error } = await supabase
    .from('nutrition_logs')
    .upsert(
      { user_id: userId, date, entries: meals, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,date' }
    );
  if (error) throw error;
}

// ─── User Stats ───────────────────────────────────────────────────────────────

export async function getUserStats(userId: string): Promise<UserStats | null> {
  const { data, error } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    userId: data.user_id,
    totalPoints: data.total_points,
    streakDays: data.streak_days,
    longestStreak: data.longest_streak,
    lastActiveDate: data.last_active_date ?? null,
    lastWeightPointsWeek: data.last_weight_points_week ?? null,
    lastNutritionPointsDate: data.last_nutrition_points_date ?? null,
    fastestWorkoutS: data.fastest_workout_s ?? null,
  };
}

export async function upsertUserStats(stats: UserStats): Promise<void> {
  const { error } = await supabase
    .from('user_stats')
    .upsert({
      user_id: stats.userId,
      total_points: stats.totalPoints,
      streak_days: stats.streakDays,
      longest_streak: stats.longestStreak,
      last_active_date: stats.lastActiveDate,
      last_weight_points_week: stats.lastWeightPointsWeek,
      last_nutrition_points_date: stats.lastNutritionPointsDate,
      fastest_workout_s: stats.fastestWorkoutS,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  if (error) throw error;
}

// ─── Achievements ─────────────────────────────────────────────────────────────

export async function getAchievements(userId: string): Promise<Achievement[]> {
  const { data, error } = await supabase
    .from('achievements')
    .select('*')
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    achievementKey: row.achievement_key,
    unlockedAt: row.unlocked_at,
    bonusPoints: row.bonus_points,
  }));
}

export async function unlockAchievement(userId: string, key: string, bonusPoints: number): Promise<Achievement | null> {
  const { data, error } = await supabase
    .from('achievements')
    .insert({ user_id: userId, achievement_key: key, bonus_points: bonusPoints })
    .select()
    .single();
  if (error) {
    // Already unlocked (unique constraint) — ignore
    if (error.code === '23505') return null;
    throw error;
  }
  return {
    id: data.id,
    userId: data.user_id,
    achievementKey: data.achievement_key,
    unlockedAt: data.unlocked_at,
    bonusPoints: data.bonus_points,
  };
}

// ─── Personal Bests ───────────────────────────────────────────────────────────

export async function getPersonalBests(userId: string): Promise<PersonalBest[]> {
  const { data, error } = await supabase
    .from('personal_bests')
    .select('*')
    .eq('user_id', userId)
    .order('exercise_name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    exerciseName: row.exercise_name,
    trackingType: row.tracking_type as TrackingType,
    bestReps: row.best_reps ?? null,
    bestWeightKg: row.best_weight_kg != null ? Number(row.best_weight_kg) : null,
    bestDurationS: row.best_duration_s != null ? Number(row.best_duration_s) : null,
    bestDistanceM: row.best_distance_m != null ? Number(row.best_distance_m) : null,
    bestPaceMs: row.best_pace_ms != null ? Number(row.best_pace_ms) : null,
    bestRepsPerS: row.best_reps_per_s != null ? Number(row.best_reps_per_s) : null,
    totalReps: row.total_reps,
    recordedAt: row.recorded_at,
  }));
}

export async function upsertPersonalBest(
  userId: string,
  pb: Omit<PersonalBest, 'id' | 'userId' | 'recordedAt'>
): Promise<void> {
  const { error } = await supabase
    .from('personal_bests')
    .upsert({
      user_id: userId,
      exercise_name: pb.exerciseName,
      tracking_type: pb.trackingType,
      best_reps: pb.bestReps,
      best_weight_kg: pb.bestWeightKg,
      best_duration_s: pb.bestDurationS,
      best_distance_m: pb.bestDistanceM,
      best_pace_ms: pb.bestPaceMs,
      best_reps_per_s: pb.bestRepsPerS,
      total_reps: pb.totalReps,
      recorded_at: new Date().toISOString(),
    }, { onConflict: 'user_id,exercise_name,tracking_type' });
  if (error) throw error;
}
