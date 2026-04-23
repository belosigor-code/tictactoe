import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  getGoals,
  getWorkoutSchedule,
  getWorkoutSessions,
  getWeightLogs,
  logWeight,
  getNutritionLogForDate,
  getWorkoutTemplates,
} from '@/lib/storage';
import type { Goal, ScheduleEntry, WorkoutTemplate, WeightLog, WorkoutSession, UserStats } from '@/lib/types';
import { levelProgress } from '@/lib/gamification';
import { Scale, Flame, Dumbbell, Plus, Play, CheckCircle, Settings } from 'lucide-react';

interface HomeViewProps {
  userId: string;
  username: string;
  stats: UserStats | null;
  onStartWorkout: (template: WorkoutTemplate) => void;
  onEditSchedule: () => void;
  onCreateWorkout: () => void;
  onNavigateToNutrition: () => void;
  onNavigateToProgress: (section?: 'history' | 'pbs') => void;
  onNavigateToProfile: (section?: 'schedule' | 'goals' | 'stats') => void;
}



function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getWeekDates(): string[] {
  const today = new Date();
  const day = today.getDay();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - day + i);
    return d.toISOString().split('T')[0];
  });
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

type SessionSummary = {
  date: string;
  workoutTemplateId: string;
  workoutName: string;
  durationSeconds?: number;
  exerciseCount: number;
};

export default function HomeView({ userId, stats, onStartWorkout, onEditSchedule, onCreateWorkout, onNavigateToNutrition, onNavigateToProgress, onNavigateToProfile }: HomeViewProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [todayKcal, setTodayKcal] = useState<number>(0);
  const [dailyKcalGoal, setDailyKcalGoal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [showWeightForm, setShowWeightForm] = useState(false);
  const [newWeight, setNewWeight] = useState('');

  useEffect(() => {
    const today = todayISO();
    Promise.all([
      getGoals(userId),
      getWorkoutSchedule(userId),
      getWorkoutTemplates(userId),
      getWorkoutSessions(userId),
      getWeightLogs(userId),
      getNutritionLogForDate(userId, today),
    ]).then(([g, sched, tmpl, sess, wlogs, todayNutrition]) => {
      setGoals(g);
      setSchedule(sched);
      setTemplates(tmpl);
      setSessions((sess as WorkoutSession[]).map((s) => ({
        date: s.date.split('T')[0],
        workoutTemplateId: s.workoutTemplateId,
        workoutName: s.workoutName,
        durationSeconds: s.durationSeconds,
        exerciseCount: s.exercises.length,
      })));
      setWeightLogs(wlogs);
      setTodayKcal(todayNutrition?.meals.flatMap((m) => m.entries).reduce((sum, e) => sum + e.kcal, 0) ?? 0);
      const nutritionGoal = g.find((goal) => goal.type === 'nutrition');
      setDailyKcalGoal(nutritionGoal?.targetValue ?? null);
    }).catch(() => toast.error('Failed to load home'))
      .finally(() => setLoading(false));
  }, [userId]);

  const today = new Date();
  const todayDayOfWeek = today.getDay();
  const weekDates = getWeekDates();

  const todaySchedule = schedule.find((s) => s.dayOfWeek === todayDayOfWeek);
  const todayTemplate = todaySchedule?.templateId
    ? templates.find((t) => t.id === todaySchedule.templateId)
    : null;

  const latestWeight = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight : null;
  const weekSessionCount = weekDates.filter((d) => sessions.some((s) => s.date === d)).length;
  const freqGoal = goals.find((g) => g.type === 'frequency');

  // Check if today's scheduled workout was already completed
  const todayCompletedSession = todayTemplate
    ? sessions.find((s) => s.date === todayISO() && s.workoutTemplateId === todayTemplate.id)
    : null;

  async function handleLogWeight(e: React.FormEvent) {
    e.preventDefault();
    if (!newWeight) return;
    const w = Number(newWeight);
    await logWeight(userId, todayISO(), w);
    setWeightLogs((prev) => {
      const filtered = prev.filter((l) => l.date !== todayISO());
      return [...filtered, { id: '', userId, date: todayISO(), weight: w }].sort((a, b) => a.date.localeCompare(b.date));
    });
    setNewWeight('');
    setShowWeightForm(false);
    toast.success('Weight logged');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-white/30 text-sm uppercase tracking-widest">Loading...</span>
      </div>
    );
  }

  const kcalPct = dailyKcalGoal ? Math.min(100, Math.round((todayKcal / dailyKcalGoal) * 100)) : 0;

  // Primary goal = most recent weight OR strength goal with a targetDate
  const primaryGoal = [...goals]
    .filter((g) => (g.type === 'weight' || g.type === 'strength') && g.targetDate)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

  // Calendar data: goal-timeline mode if primary goal has a targetDate, else monthly fallback
  const calendarData = (() => {
    const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (primaryGoal?.targetDate) {
      const startDate = new Date(primaryGoal.createdAt).toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
      const endDate = primaryGoal.targetDate;
      const active = new Set<string>();
      sessions.forEach((s) => { if (s.date >= startDate && s.date <= endDate) active.add(s.date); });
      weightLogs.forEach((w) => { if (w.date >= startDate && w.date <= endDate) active.add(w.date); });
      if (stats?.lastActiveDate && stats.lastActiveDate >= startDate && stats.lastActiveDate <= endDate) active.add(stats.lastActiveDate);
      const label = primaryGoal.type === 'strength'
        ? (primaryGoal.exerciseName ? `${primaryGoal.exerciseName}` : 'Strength Goal')
        : 'Weight Goal';
      return { startDate, endDate, active, label, sublabel: `${fmtDate(startDate)} → ${fmtDate(endDate)}` };
    }
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const active = new Set<string>();
    sessions.forEach((s) => { if (s.date.startsWith(prefix)) active.add(s.date); });
    weightLogs.forEach((w) => { if (w.date.startsWith(prefix)) active.add(w.date); });
    if (stats?.lastActiveDate?.startsWith(prefix)) active.add(stats.lastActiveDate);
    return {
      startDate: `${prefix}-01`,
      endDate: `${prefix}-${String(daysInMonth).padStart(2, '0')}`,
      active,
      label: now.toLocaleString('en-US', { month: 'long' }),
      sublabel: null as string | null,
    };
  })();

  return (
    <div className="px-5 pt-5 pb-4 space-y-4">
      {/* Greeting */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-white/40">{getGreeting()}</p>
        <h1 className="font-lexend font-black text-3xl text-white mt-0.5">Champ! 👋</h1>
      </div>

      {/* Consistency calendar + motivational panel */}
      {(() => {
        const { startDate, endDate, active, label, sublabel } = calendarData;
        const allDates: string[] = [];
        const cur = new Date(startDate + 'T00:00:00');
        const endD = new Date(endDate + 'T00:00:00');
        while (cur <= endD) { allDates.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1); }
        const cols = Math.ceil(Math.sqrt(allDates.length));
        const rows = Math.ceil(allDates.length / cols);
        const cells: (string | null)[] = [...allDates];
        while (cells.length < cols * rows) cells.push(null);
        const today = todayISO();
        const daysElapsed = allDates.filter(d => d <= today).length;
        const daysLeft = allDates.filter(d => d > today).length;
        const consistencyPct = daysElapsed > 0 ? Math.round(active.size / daysElapsed * 100) : 0;
        const motivationalMsg =
          consistencyPct >= 80 ? "You're crushing it!" :
          consistencyPct >= 60 ? "Keep it up!" :
          consistencyPct >= 40 ? "Stay consistent!" :
          daysElapsed <= 3     ? "Great start!" :
                                 "Every day counts!";
        return (
          <div className="flex gap-3 items-stretch">
            {/* Square grid — half width */}
            <div onClick={() => onNavigateToProgress('history')} className="glass-card rounded-2xl p-3 w-1/2 flex items-center justify-center tap-scale cursor-pointer">
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, gap: '2px', aspectRatio: `${cols}/${rows}`, width: '100%' }}>
                {cells.map((dateStr, i) => {
                  if (!dateStr) return <div key={i} />;
                  const isActive = active.has(dateStr);
                  const isToday = dateStr === today;
                  const isFuture = dateStr > today;
                  return (
                    <div key={i}
                      className={`rounded-sm transition-colors ${isFuture ? 'bg-white/5' : isActive ? 'bg-primary/80' : isToday ? 'bg-white/15 border border-white/20' : 'bg-white/10'}`}
                    />
                  );
                })}
              </div>
            </div>
            {/* Motivational panel */}
            <div onClick={() => onNavigateToProfile('goals')} className="flex-1 glass-card rounded-2xl p-4 flex flex-col justify-between min-w-0 tap-scale cursor-pointer">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-0.5">{label}</p>
                {sublabel && <p className="text-[10px] text-white/25">{sublabel}</p>}
                {primaryGoal?.type === 'strength' && primaryGoal.exerciseName && (
                  <p className="text-[10px] text-white/25">{primaryGoal.targetValue} kg target</p>
                )}
              </div>
              <div>
                <span className="font-lexend font-black text-4xl text-primary text-glow-primary">{daysLeft}</span>
                <p className="text-xs font-bold uppercase tracking-widest text-white/30 mt-0.5">days to go</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-white/50"><span className="font-bold text-white">{consistencyPct}%</span> consistency</p>
                <p className="text-xs text-white/50"><span className="font-bold text-white">{active.size}</span> days active</p>
                <p className="text-[11px] font-bold text-primary/80 mt-1">{motivationalMsg}</p>
              </div>
            </div>
          </div>
        );
      })()}


      {/* Points / level strip */}
      {stats && (() => {
        const lp = levelProgress(stats.totalPoints);
        return (
          <button onClick={() => onNavigateToProfile('stats')} className="w-full glass-card rounded-2xl px-4 py-3 flex items-center gap-3 tap-scale text-left">
            <div className="flex-shrink-0 h-9 px-2.5 flex items-center justify-center bg-primary/15 border border-primary/30 rounded-xl">
              <span className="text-xs font-bold text-primary tracking-wide">LVL {lp.level}</span>
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-white/40">{lp.name}</span>
                <span className="text-xs font-mono-timer text-white/50">{stats.totalPoints.toLocaleString()} pts</span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${lp.pct}%` }} />
              </div>
            </div>
            <div className="flex-shrink-0 flex items-center gap-1">
              <span className="text-base">🔥</span>
              <span className="text-sm font-bold text-white/70">{stats.streakDays}</span>
            </div>
          </button>
        );
      })()}

      {/* Bento row: streak + weight */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onNavigateToProgress('history')} className="glass-card rounded-2xl p-4 flex flex-col gap-2 tap-scale text-left">
          <p className="text-xs font-bold uppercase tracking-widest text-white/40">This Week</p>
          <div className="flex items-end gap-1 mt-1">
            <span className="font-lexend font-black text-4xl text-primary text-glow-primary">{weekSessionCount}</span>
            {freqGoal && <span className="text-white/40 text-lg font-bold mb-1">/{freqGoal.targetValue}</span>}
          </div>
          <p className="text-xs text-white/30">sessions done</p>
        </button>

        {(() => {
          // Only show weight goal progress if primary goal is weight (not strength)
          const wGoal = primaryGoal?.type === 'weight' ? primaryGoal : null;
          const daysLeft = wGoal?.targetDate ? daysUntil(wGoal.targetDate) : null;
          let pct = 0;
          if (wGoal && latestWeight !== null) {
            const startWeight = weightLogs.length > 0 ? weightLogs[0].weight : latestWeight;
            const totalChange = wGoal.targetValue - startWeight;
            const moved = (latestWeight - startWeight) * Math.sign(totalChange);
            pct = Math.abs(totalChange) > 0 ? Math.min(100, Math.max(0, Math.round((moved / Math.abs(totalChange)) * 100))) : 0;
          }
          return (
            <button onClick={() => setShowWeightForm(true)} className="glass-card rounded-2xl p-4 flex flex-col gap-2 tap-scale text-left">
              <div className="flex items-center justify-between w-full">
                <p className="text-xs font-bold uppercase tracking-widest text-white/40">Current Weight</p>
                <Plus size={12} className="text-white/40" />
              </div>
              {latestWeight !== null ? (
                <div className="flex items-end gap-1 mt-1">
                  <span className="font-lexend font-black text-3xl text-white">{latestWeight}</span>
                  <span className="text-white/40 text-sm mb-1">kg</span>
                </div>
              ) : (
                <p className="text-white/30 text-sm mt-1">Not logged</p>
              )}
              {wGoal ? (
                <div className="space-y-1.5 mt-auto">
                  {pct > 0 && (
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/30">→ {wGoal.targetValue} kg</span>
                    {daysLeft !== null && <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">{daysLeft}d</span>}
                  </div>
                </div>
              ) : (
                <Scale size={14} className="text-white/20" />
              )}
            </button>
          );
        })()}
      </div>

      {/* Weight log form */}
      {showWeightForm && (
        <form onSubmit={handleLogWeight} className="glass-card rounded-xl p-3 flex gap-2">
          <input
            autoFocus
            type="number"
            step="0.1"
            min="0"
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
            placeholder="kg"
            className="flex-1 h-10 bg-white/5 border border-white/10 rounded-lg px-3 text-white text-sm font-mono-timer focus:outline-none focus:border-primary/60"
          />
          <button type="button" onClick={() => setShowWeightForm(false)} className="h-10 px-3 rounded-lg text-xs font-bold uppercase tracking-widest text-white/50 tap-scale glass-card">Cancel</button>
          <button type="submit" disabled={!newWeight} className="h-10 px-3 bg-primary text-primary-foreground rounded-lg text-xs font-bold uppercase tracking-widest tap-scale disabled:opacity-40">Save</button>
        </form>
      )}

      {/* Today's workout — hero card */}
      <div
        className="glass-card rounded-2xl overflow-hidden cursor-pointer tap-scale"
        onClick={() => {
          if (todayCompletedSession) { onNavigateToProgress('history'); }
          else if (todayTemplate) { onStartWorkout(todayTemplate); }
          else if (todaySchedule === undefined && templates.length === 0) { onCreateWorkout(); }
          else { onNavigateToProfile('schedule'); }
        }}
      >
        <div className="relative p-5" style={{ background: 'linear-gradient(135deg, rgba(204,255,0,0.08) 0%, rgba(255,255,255,0.02) 100%)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Dumbbell size={14} className="text-primary" />
              <p className="text-xs font-bold uppercase tracking-widest text-white/50">Today's Workout</p>
            </div>
            {/* Edit schedule shortcut */}
            <button
              onClick={templates.length === 0 ? onCreateWorkout : onEditSchedule}
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white/30 tap-scale hover:text-white/50 transition-colors"
            >
              <Settings size={11} />
              Edit
            </button>
          </div>

          {todayCompletedSession ? (
            /* Completed state */
            <button onClick={() => onNavigateToProgress('history')} className="w-full text-left tap-scale">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle size={18} className="text-primary" />
                <h2 className="font-lexend font-bold text-2xl text-white">{todayCompletedSession.workoutName}</h2>
              </div>
              <p className="text-white/40 text-sm mb-1">Completed today · tap to view</p>
              <div className="flex gap-4 mt-3">
                {todayCompletedSession.durationSeconds && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Duration</p>
                    <p className="font-mono-timer font-bold text-white/70">{formatDuration(todayCompletedSession.durationSeconds)}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Exercises</p>
                  <p className="font-mono-timer font-bold text-white/70">{todayCompletedSession.exerciseCount}</p>
                </div>
              </div>
            </button>
          ) : todayTemplate ? (
            /* Ready to start */
            <div>
              <h2 className="font-lexend font-bold text-2xl text-white mb-1">{todayTemplate.name}</h2>
              <p className="text-white/40 text-sm mb-4">{todayTemplate.exercises.length} exercise{todayTemplate.exercises.length !== 1 ? 's' : ''}</p>
              <button
                onClick={() => onStartWorkout(todayTemplate)}
                className="w-full h-13 bg-primary text-primary-foreground rounded-xl font-bold uppercase tracking-widest text-sm tap-scale glow-primary flex items-center justify-center gap-2 py-3.5"
              >
                <Play size={18} fill="currentColor" />
                START WORKOUT
              </button>
            </div>
          ) : todaySchedule === undefined && templates.length === 0 ? (
            <div className="space-y-3">
              <p className="text-white/30 text-sm">No workouts created yet.</p>
              <button
                onClick={onCreateWorkout}
                className="w-full h-11 bg-primary text-primary-foreground rounded-xl font-bold uppercase tracking-widest text-sm tap-scale glow-primary-sm flex items-center justify-center gap-2"
              >
                Create Workout
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🛌</span>
                <h2 className="font-lexend font-bold text-2xl text-white">Rest Day</h2>
              </div>
              <p className="text-white/40 text-sm leading-relaxed">Today is your rest day. Enjoy it, recover, and get ready for the next session soon.</p>
            </div>
          )}
        </div>
      </div>



      {/* Calories */}
      <div onClick={() => onNavigateToNutrition()} className="glass-card rounded-2xl p-4 cursor-pointer tap-scale">
        <div className="flex items-center gap-2 mb-3">
          <Flame size={14} className="text-accent" />
          <p className="text-xs font-bold uppercase tracking-widest text-white/40">Today's Calories</p>
        </div>
        <div className="flex items-end justify-between mb-3">
          <div className="flex items-end gap-1.5">
            <span className="font-lexend font-black text-3xl text-white">{todayKcal}</span>
            {dailyKcalGoal && <span className="text-white/30 text-base mb-0.5">/ {dailyKcalGoal} kcal</span>}
          </div>
          {dailyKcalGoal && (
            <span className={`text-xs font-bold uppercase tracking-widest ${kcalPct >= 100 ? 'text-primary' : 'text-white/40'}`}>{kcalPct}%</span>
          )}
        </div>
        {dailyKcalGoal && (
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${kcalPct}%` }} />
          </div>
        )}
        <button
          onClick={onNavigateToNutrition}
          className="w-full h-11 bg-primary text-primary-foreground rounded-xl font-bold uppercase tracking-widest text-sm tap-scale glow-primary-sm"
        >
          Log Meal
        </button>
      </div>
    </div>
  );
}
