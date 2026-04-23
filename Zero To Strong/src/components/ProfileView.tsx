import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  getGoals, saveGoal, updateGoal, deleteGoal,
  getWorkoutSchedule, addScheduleEntry, removeScheduleEntry,
  getWorkoutTemplates, getExercises, saveExercise,
} from '@/lib/storage';
import type { Goal, GoalType, ScheduleEntry, WorkoutTemplate, UserStats, Achievement, Exercise } from '@/lib/types';
import { levelProgress, ACHIEVEMENT_DEFS, ACHIEVEMENT_MAP, getStreakDef } from '@/lib/gamification';
import { Trash2, Plus, Pencil, LogOut, Target, Calendar, Star, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import ExerciseCatalogInput from './ExerciseCatalogInput';

interface ProfileViewProps {
  userId: string;
  username: string;
  stats: UserStats | null;
  achievements: Achievement[];
  onLogout: () => void;
  scrollTarget?: 'schedule' | 'goals' | 'stats' | null;
  onScrollHandled?: () => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  weight: 'Dream Weight',
  strength: 'Strength Goal',
  frequency: 'Training Frequency',
  nutrition: 'Daily Calories',
};

// ─── Custom Date Picker ───────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_HEADERS = ['M','T','W','T','F','S','S'];

function CustomDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => value ? parseInt(value.split('-')[0]) : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => value ? parseInt(value.split('-')[1]) - 1 : today.getMonth());

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  function selectDay(day: number) {
    onChange(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    setOpen(false);
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // 0=Mon
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const selParts = value ? value.split('-').map(Number) : null;
  const displayValue = selParts
    ? `${String(selParts[2]).padStart(2, '0')} ${MONTH_NAMES[selParts[1] - 1]} ${selParts[0]}`
    : '';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-left text-sm transition-colors focus:outline-none focus:border-primary/60 flex items-center justify-between"
      >
        <span className={value ? 'text-white' : 'text-white/30'}>{displayValue || 'Select date…'}</span>
        <Calendar size={14} className="text-white/30 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-[calc(100%+4px)] left-0 right-0 bg-[#1a1a1a] border border-white/10 rounded-2xl p-4 shadow-2xl">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="h-8 w-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white tap-scale">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold text-white">{MONTH_NAMES[viewMonth]} {viewYear}</span>
            <button type="button" onClick={nextMonth} className="h-8 w-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white tap-scale">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_HEADERS.map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold uppercase tracking-widest text-white/25 py-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const isSelected = selParts && selParts[0] === viewYear && selParts[1] - 1 === viewMonth && selParts[2] === day;
              const isTdy = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`h-9 w-full rounded-lg text-sm font-bold tap-scale transition-all ${
                    isSelected
                      ? 'bg-primary text-primary-foreground glow-primary-sm'
                      : isTdy
                      ? 'bg-white/15 text-white border border-white/20'
                      : 'text-white/60 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Goal Form ────────────────────────────────────────────────────────────────

interface GoalFormProps {
  existing?: Goal;
  exercises: Exercise[];
  onSave: (data: Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

function GoalForm({ existing, exercises, onSave, onCancel }: GoalFormProps) {
  const [type, setType] = useState<GoalType>(existing?.type ?? 'weight');
  const [targetValue, setTargetValue] = useState(
    existing?.type === 'strength' ? (existing?.targetValue ?? 0).toString() : (existing?.targetValue?.toString() ?? '')
  );
  const [targetReps, setTargetReps] = useState(existing?.targetReps?.toString() ?? '');
  const [targetDate, setTargetDate] = useState(existing?.targetDate ?? '');
  const [exerciseName, setExerciseName] = useState(existing?.exerciseName ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (type === 'strength') {
      if (!exerciseName.trim()) return;
      if (!targetValue && !targetReps) return;
      onSave({
        type,
        targetValue: Number(targetValue) || 0,
        targetReps: targetReps ? Number(targetReps) : undefined,
        targetDate: targetDate || undefined,
        exerciseName: exerciseName.trim(),
      });
    } else {
      if (!targetValue) return;
      onSave({
        type,
        targetValue: Number(targetValue),
        targetDate: (type === 'weight') ? (targetDate || undefined) : undefined,
      });
    }
  }

  const placeholder: Record<GoalType, string> = {
    weight: 'e.g. 80',
    strength: '',
    frequency: 'e.g. 4',
    nutrition: 'e.g. 2500',
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-5 border border-primary/30 space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">
        {existing ? 'EDIT GOAL' : 'ADD GOAL'}
      </h3>

      {/* Type selector */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">TYPE</label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(GOAL_TYPE_LABELS) as GoalType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`h-10 text-xs font-bold uppercase tracking-wide rounded-xl tap-scale transition-all ${
                type === t
                  ? 'bg-primary text-primary-foreground glow-primary-sm'
                  : 'glass-card text-white/50 hover:text-white/70'
              }`}
            >
              {GOAL_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Strength-specific fields */}
      {type === 'strength' && (
        <>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">EXERCISE</label>
            <ExerciseCatalogInput
              value={exerciseName}
              onChange={setExerciseName}
              onSelect={(entry) => setExerciseName(entry.name)}
              userExercises={exercises}
              placeholder="e.g. Bench Press"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">TARGET WEIGHT <span className="normal-case text-white/20">kg</span></label>
              <input
                type="number"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                min="0"
                step="0.5"
                className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-sm font-mono-timer focus:outline-none focus:border-primary/60 transition-colors"
                placeholder="e.g. 100"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">TARGET REPS</label>
              <input
                type="number"
                value={targetReps}
                onChange={(e) => setTargetReps(e.target.value)}
                min="1"
                className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-sm font-mono-timer focus:outline-none focus:border-primary/60 transition-colors"
                placeholder="e.g. 12"
              />
            </div>
          </div>
        </>
      )}

      {/* Non-strength target */}
      {type !== 'strength' && (
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
            TARGET
            {type === 'weight' && <span className="normal-case text-white/20 ml-1">kg</span>}
            {type === 'frequency' && <span className="normal-case text-white/20 ml-1">sessions/week</span>}
            {type === 'nutrition' && <span className="normal-case text-white/20 ml-1">kcal/day</span>}
          </label>
          <input
            type="number"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            required
            min="0"
            className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-sm font-mono-timer focus:outline-none focus:border-primary/60 transition-colors"
            placeholder={placeholder[type]}
          />
        </div>
      )}

      {/* Date picker */}
      {(type === 'weight' || type === 'strength') && (
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">TARGET DATE</label>
          <CustomDatePicker value={targetDate} onChange={setTargetDate} />
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-12 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/50 tap-scale"
        >
          CANCEL
        </button>
        <button
          type="submit"
          className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase tracking-widest tap-scale glow-primary-sm"
        >
          {existing ? 'SAVE' : 'ADD'}
        </button>
      </div>
    </form>
  );
}

// ─── ProfileView ──────────────────────────────────────────────────────────────

export default function ProfileView({ userId, username, stats, achievements, onLogout, scrollTarget, onScrollHandled }: ProfileViewProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [selectKeys, setSelectKeys] = useState<Record<number, number>>({});
  const selectRefs = useRef<Record<number, HTMLSelectElement | null>>({});
  const [achievementsExpanded, setAchievementsExpanded] = useState(false);
  const [selectedAchievementKey, setSelectedAchievementKey] = useState<string | null>(null);
  const scheduleRef = useRef<HTMLDivElement>(null);
  const goalsRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      getGoals(userId),
      getWorkoutSchedule(userId),
      getWorkoutTemplates(userId),
      getExercises(userId),
    ]).then(([g, s, t, ex]) => {
      setGoals(g);
      setSchedule(s);
      setTemplates(t);
      setExercises(ex);
    }).catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!scrollTarget) return;
    const refMap = { schedule: scheduleRef, goals: goalsRef, stats: statsRef };
    const ref = refMap[scrollTarget];
    if (scrollTarget === 'stats') setAchievementsExpanded(true);
    setTimeout(() => {
      ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onScrollHandled?.();
    }, 150);
  }, [scrollTarget]);

  async function ensureExerciseExists(data: Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) {
    if (data.type !== 'strength' || !data.exerciseName) return;
    const alreadyExists = exercises.some(
      (ex) => ex.name.toLowerCase() === data.exerciseName!.toLowerCase()
    );
    if (alreadyExists) return;
    const trackingType = (data.targetValue ?? 0) > 0 ? 'reps_weight' : 'bodyweight_reps';
    const newEx = await saveExercise(userId, {
      name: data.exerciseName,
      trackingType,
      defaultSets: 3,
    });
    setExercises((prev) => [...prev, newEx].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function handleAddGoal(data: Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) {
    // Weight and strength are mutually exclusive primary goals — remove both when adding either
    if (data.type === 'weight' || data.type === 'strength') {
      const existingPrimary = goals.filter((g) => g.type === 'weight' || g.type === 'strength');
      await Promise.all(existingPrimary.map((g) => deleteGoal(g.id)));
      const newGoal = await saveGoal(userId, data);
      setGoals((prev) => [...prev.filter((g) => g.type !== 'weight' && g.type !== 'strength'), newGoal]);
    } else {
      const existing = goals.find((g) => g.type === data.type);
      if (existing) await deleteGoal(existing.id);
      const newGoal = await saveGoal(userId, data);
      setGoals((prev) => [...prev.filter((g) => g.type !== data.type), newGoal]);
    }
    await ensureExerciseExists(data);
    setShowGoalForm(false);
    toast.success('Goal saved');
  }

  async function handleUpdateGoal(goal: Goal, data: Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) {
    await updateGoal(goal.id, { targetValue: data.targetValue, targetReps: data.targetReps, targetDate: data.targetDate, exerciseName: data.exerciseName });
    setGoals((prev) => prev.map((g) => g.id === goal.id ? { ...g, ...data } : g));
    await ensureExerciseExists(data);
    setEditingGoal(null);
    toast.success('Goal updated');
  }

  async function handleDeleteGoal(goalId: string) {
    await deleteGoal(goalId);
    setGoals((prev) => prev.filter((g) => g.id !== goalId));
    toast.success('Goal removed');
  }

  function getDayEntries(dayOfWeek: number): ScheduleEntry[] {
    return schedule.filter((s) => s.dayOfWeek === dayOfWeek);
  }

  async function handleAddToDay(dayOfWeek: number, templateId: string) {
    if (!templateId) return;
    try {
      const entry = await addScheduleEntry(userId, dayOfWeek, templateId);
      setSchedule((prev) => [...prev, entry]);
      setSelectKeys((prev) => ({ ...prev, [dayOfWeek]: (prev[dayOfWeek] ?? 0) + 1 }));
    } catch (err) {
      toast.error(`Failed to add workout: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleRemoveEntry(entryId: string) {
    await removeScheduleEntry(entryId);
    setSchedule((prev) => prev.filter((s) => s.id !== entryId));
  }

  function formatGoalSummary(goal: Goal): string {
    switch (goal.type) {
      case 'weight': return `Target: ${goal.targetValue} kg`;
      case 'strength': return `${goal.exerciseName}: ${goal.targetValue}`;
      case 'frequency': return `${goal.targetValue} sessions/week`;
      case 'nutrition': return `${goal.targetValue} kcal/day`;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-white/30 text-sm uppercase tracking-widest">Loading...</span>
      </div>
    );
  }

  const unlockedKeys = new Set(achievements.map((a) => a.achievementKey));

  // Build full achievement list: all defs + any dynamic streak defs
  const allDefs = [...ACHIEVEMENT_DEFS];
  for (const a of achievements) {
    if (!ACHIEVEMENT_MAP[a.achievementKey]) {
      allDefs.push(getStreakDef(parseInt(a.achievementKey.replace('streak_', ''), 10)));
    }
  }

  return (
    <div className="px-5 pt-5 pb-4 space-y-6">

      {/* Stats */}
      {stats && (() => {
        const lp = levelProgress(stats.totalPoints);
        return (
          <div ref={statsRef}>
            <div className="flex items-center gap-2 mb-3">
              <Star size={14} className="text-primary" />
              <p className="text-xs font-bold uppercase tracking-widest text-white/50">Stats</p>
            </div>
            {/* Level card — tap to expand achievements */}
            <button
              onClick={() => setAchievementsExpanded((v) => !v)}
              className="w-full text-left glass-card rounded-2xl p-4 space-y-3 mb-3 tap-scale"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-primary">{lp.name}</p>
                  <p className="font-lexend font-black text-2xl text-white">Level {lp.level}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-white/40">Streak</p>
                    <p className="font-lexend font-bold text-xl text-white">🔥 {stats.streakDays}</p>
                  </div>
                  {achievementsExpanded ? <ChevronUp size={16} className="text-white/30" /> : <ChevronDown size={16} className="text-white/30" />}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-white/40">
                  <span>{stats.totalPoints.toLocaleString()} pts</span>
                  {lp.needed > lp.current
                    ? <span>{(lp.needed - lp.current).toLocaleString()} to Level {lp.level + 1}</span>
                    : <span>Max level</span>
                  }
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${lp.pct}%` }} />
                </div>
              </div>
            </button>
            {/* Achievements grid — collapsed by default */}
            {achievementsExpanded && (
              <div className="grid grid-cols-3 gap-2">
                {allDefs.map((def) => {
                  const unlocked = unlockedKeys.has(def.key);
                  return (
                    <button
                      key={def.key}
                      onClick={() => setSelectedAchievementKey(def.key)}
                      className={`glass-card rounded-xl p-3 flex flex-col items-center gap-1 text-center transition-all tap-scale ${
                        unlocked ? 'border border-primary/30' : 'opacity-35'
                      }`}
                    >
                      <span className="text-xl">{def.icon}</span>
                      <p className={`text-[10px] font-bold uppercase tracking-wide leading-tight ${unlocked ? 'text-white' : 'text-white/50'}`}>
                        {def.label}
                      </p>
                      {unlocked && (
                        <p className="text-[9px] text-primary font-bold">+{def.bonusPoints} pts</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Goals */}
      <div ref={goalsRef}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target size={14} className="text-primary" />
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">Goals</p>
          </div>
          <button
            onClick={() => { setShowGoalForm(true); setEditingGoal(null); }}
            className="h-8 px-3 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase tracking-widest tap-scale flex items-center gap-1.5 glow-primary-sm"
          >
            <Plus size={13} />NEW
          </button>
        </div>

        {showGoalForm && (
          <div className="mb-3">
            <GoalForm exercises={exercises} onSave={handleAddGoal} onCancel={() => setShowGoalForm(false)} />
          </div>
        )}

        {goals.length === 0 && !showGoalForm ? (
          <div className="glass-card rounded-xl p-6 text-center">
            <p className="text-white/30 text-sm">No goals set yet.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {goals.map((goal) => (
              <div key={goal.id}>
                {editingGoal?.id === goal.id ? (
                  <GoalForm
                    existing={goal}
                    exercises={exercises}
                    onSave={(data) => handleUpdateGoal(goal, data)}
                    onCancel={() => setEditingGoal(null)}
                  />
                ) : (
                  <div onClick={() => setEditingGoal(goal)} className="glass-card rounded-xl p-4 flex items-center justify-between cursor-pointer tap-scale">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-primary mb-0.5">{GOAL_TYPE_LABELS[goal.type]}</p>
                      <p className="text-sm text-white/70">{formatGoalSummary(goal)}</p>
                      {goal.targetDate && (
                        <p className="text-xs text-white/30 mt-0.5">by {new Date(goal.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <div className="h-9 w-9 flex items-center justify-center glass-card rounded-xl text-white/50">
                        <Pencil size={13} />
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteGoal(goal.id); }}
                        className="h-9 w-9 flex items-center justify-center rounded-xl tap-scale bg-destructive/10 border border-destructive/30 text-destructive"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weekly Schedule */}
      <div ref={scheduleRef}>
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={14} className="text-white/40" />
          <p className="text-xs font-bold uppercase tracking-widest text-white/50">Weekly Schedule</p>
        </div>
        <div className="space-y-2">
          {DAYS.map((day, i) => {
            const entries = getDayEntries(i);
            return (
              <div key={i} onClick={() => selectRefs.current[i]?.focus()} className="glass-card rounded-xl px-4 py-3 space-y-2 cursor-pointer">
                <span className="text-xs font-bold uppercase tracking-widest text-white/40">{day}</span>

                {entries.length === 0 && (
                  <p className="text-xs text-white/25 italic">Rest day</p>
                )}

                {entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-white/80 flex-1">{entry.templateName ?? 'Unknown'}</span>
                    <button
                      onClick={() => handleRemoveEntry(entry.id)}
                      className="h-7 w-7 flex items-center justify-center rounded-lg bg-destructive/10 border border-destructive/30 text-destructive tap-scale flex-shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}

                {templates.length > 0 && (
                  <div className="pt-1">
                    <select
                      key={selectKeys[i] ?? 0}
                      ref={(el) => { selectRefs.current[i] = el; }}
                      defaultValue=""
                      onClick={(e) => e.stopPropagation()}
                      onChange={async (e) => {
                        const templateId = e.target.value;
                        if (!templateId) return;
                        await handleAddToDay(i, templateId);
                      }}
                      className="w-full h-8 bg-white/5 border border-white/10 rounded-lg px-2 text-white/50 text-xs focus:outline-none focus:border-primary/60 transition-colors"
                    >
                      <option value="">+ Add workout…</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Account — at the very bottom */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-3">Account</p>
        <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="font-lexend font-bold text-lg text-white">{username}</p>
          </div>
          <button
            onClick={onLogout}
            className="h-9 px-3 flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold uppercase tracking-widest tap-scale"
          >
            <LogOut size={13} />
            LOGOUT
          </button>
        </div>
      </div>

      {/* Achievement detail overlay */}
      {selectedAchievementKey && (() => {
        const def = ACHIEVEMENT_MAP[selectedAchievementKey] ?? getStreakDef(parseInt(selectedAchievementKey.replace('streak_', '') || '0', 10));
        const unlocked = unlockedKeys.has(selectedAchievementKey);
        return (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center p-4"
            onClick={() => setSelectedAchievementKey(null)}
          >
            <div
              className="w-full max-w-lg glass-card rounded-2xl p-6 text-center space-y-3 border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-5xl block">{def.icon}</span>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">
                  {unlocked ? 'Unlocked' : 'Locked'}
                </p>
                <h3 className="font-lexend font-black text-xl text-white">{def.label}</h3>
                <p className="text-white/50 text-sm mt-1">{def.description}</p>
              </div>
              <p className={`font-lexend font-black text-3xl ${unlocked ? 'text-primary' : 'text-white/20'}`}>
                +{def.bonusPoints.toLocaleString()} pts
              </p>
              <button
                onClick={() => setSelectedAchievementKey(null)}
                className="w-full h-11 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/50 tap-scale"
              >
                Close
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
