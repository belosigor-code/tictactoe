import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { getWorkoutSessions, getWeightLogs, logWeight, upsertUserStats, unlockAchievement, getGoals, getPersonalBests } from '@/lib/storage';
import type { WorkoutSession, WeightLog, DurationSetLog, RepsWeightSetLog, DistanceTimeSetLog, UserStats, Achievement, PersonalBest } from '@/lib/types';
import { awardWeightPoints, checkAchievements, ACHIEVEMENT_MAP } from '@/lib/gamification';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, ChevronDown, ChevronUp, Pencil, Check, X } from 'lucide-react';

interface ProgressViewProps {
  userId: string;
  stats: UserStats | null;
  unlockedAchievementKeys: Set<string>;
  scrollToSection?: 'history' | 'pbs' | null;
  onScrollHandled?: () => void;
  onStatsUpdated: (stats: UserStats, newAchievements?: Achievement[]) => void;
}

interface ChartPoint {
  date: string;
  value: number;
}

interface ExerciseChart {
  name: string;
  trackingType: string;
  data: ChartPoint[];
  yLabel: string;
}

interface WeekData {
  key: string;       // Monday ISO date "YYYY-MM-DD"
  label: string;     // "Apr 14"
  avg: number;       // rounded average weight
  entries: WeightLog[];
}

const LIME = 'hsl(72, 100%, 50%)';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fullDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

/** Returns the Monday of the week containing dateStr (ISO "YYYY-MM-DD"). */
function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().split('T')[0];
}

function getCurrentWeekKey(): string {
  return getWeekKey(new Date().toISOString().split('T')[0]);
}

function buildWeeks(logs: WeightLog[]): WeekData[] {
  const byWeek: Record<string, WeightLog[]> = {};
  for (const log of logs) {
    const key = getWeekKey(log.date);
    if (!byWeek[key]) byWeek[key] = [];
    byWeek[key].push(log);
  }
  return Object.entries(byWeek)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entries]) => {
      const avg = entries.reduce((sum, e) => sum + e.weight, 0) / entries.length;
      const d = new Date(key + 'T00:00:00');
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return { key, label, avg: parseFloat(avg.toFixed(1)), entries };
    });
}

// ─── Exercise chart helpers ───────────────────────────────────────────────────

function buildCharts(sessions: WorkoutSession[]): ExerciseChart[] {
  const byExercise: Record<string, { date: string; trackingType: string; sets: (DurationSetLog | RepsWeightSetLog | DistanceTimeSetLog)[] }[]> = {};

  for (const session of sessions) {
    for (const ex of session.exercises) {
      if (!byExercise[ex.exerciseName]) byExercise[ex.exerciseName] = [];
      byExercise[ex.exerciseName].push({
        date: session.date,
        trackingType: ex.trackingType,
        sets: ex.sets as (DurationSetLog | RepsWeightSetLog | DistanceTimeSetLog)[],
      });
    }
  }

  return Object.entries(byExercise).map(([name, entries]) => {
    const trackingType = entries[0].trackingType;
    let yLabel = '';
    const data: ChartPoint[] = entries.map(({ date, sets }) => {
      let value = 0;
      if (trackingType === 'duration') {
        const times = sets.map((s) => (s as DurationSetLog).time);
        value = parseFloat((times.reduce((a, b) => a + b, 0) / times.length).toFixed(1));
        yLabel = 'Avg hold (s)';
      } else if (trackingType === 'reps_weight') {
        value = Math.max(...sets.map((s) => (s as RepsWeightSetLog).weight));
        yLabel = 'Max weight (kg)';
      } else if (trackingType === 'bodyweight_reps') {
        value = Math.max(...sets.map((s) => (s as { reps: number }).reps));
        yLabel = 'Max reps';
      } else {
        value = sets.reduce((a, s) => a + (s as DistanceTimeSetLog).distance, 0);
        yLabel = 'Total distance (m)';
      }
      return { date: shortDate(date), value };
    });
    return { name, trackingType, data, yLabel };
  });
}

// ─── Exercise line chart ──────────────────────────────────────────────────────

function ExerciseLineChart({ data }: { data: ChartPoint[] }) {
  if (data.length < 2) {
    return (
      <p className="text-xs text-white/30 py-4 text-center">
        Need at least 2 sessions to show a chart.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} width={40} />
        <Tooltip
          contentStyle={{
            background: 'rgba(20,20,20,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '0.75rem',
            fontSize: 12,
            color: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(20px)',
          }}
          labelStyle={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={LIME}
          strokeWidth={2}
          dot={{ fill: LIME, strokeWidth: 0, r: 3 }}
          activeDot={{ fill: LIME, r: 5, filter: 'drop-shadow(0 0 4px rgba(204,255,0,0.6))' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Weight bar chart ─────────────────────────────────────────────────────────

const BAR_WIDTH = 44; // px per bar including gap

interface WeightBarChartProps {
  weeks: WeekData[];
  selectedKey: string;
  currentKey: string;
  onSelect: (key: string) => void;
}

function WeightBarChart({ weeks, selectedKey, currentKey, onSelect }: WeightBarChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to the right (most recent) on first render
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [weeks.length]);

  if (weeks.length === 0) return null;

  const maxAvg = Math.max(...weeks.map((w) => w.avg));
  const minAvg = Math.min(...weeks.map((w) => w.avg));
  const range = maxAvg - minAvg || 1;

  // Bar height: 20%–100% of chart area, scaled by (avg - min) / range
  function barPct(avg: number): number {
    return 20 + ((avg - minAvg) / range) * 80;
  }

  const totalWidth = Math.max(weeks.length * BAR_WIDTH, 1);

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto pb-1"
      style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
    >
      <div
        className="flex items-end gap-1 h-36 px-1"
        style={{ width: totalWidth, minWidth: '100%' }}
      >
        {weeks.map((week) => {
          const isCurrent = week.key === currentKey;
          const isSelected = week.key === selectedKey;
          const colored = isSelected || (isCurrent && selectedKey === currentKey);

          return (
            <button
              key={week.key}
              onClick={() => onSelect(week.key)}
              className="flex flex-col items-center gap-1 flex-shrink-0 tap-scale group"
              style={{ width: BAR_WIDTH - 4 }}
            >
              {/* Avg label above bar */}
              <span className={`text-[9px] font-mono-timer font-bold transition-colors ${colored ? 'text-primary' : 'text-white/25'}`}>
                {week.avg}
              </span>
              {/* Bar */}
              <div
                className="w-full rounded-t-lg transition-all"
                style={{
                  height: `${barPct(week.avg)}%`,
                  background: colored
                    ? LIME
                    : 'rgba(255,255,255,0.12)',
                  boxShadow: colored ? `0 0 8px rgba(204,255,0,0.35)` : 'none',
                  minHeight: 6,
                }}
              />
              {/* Week label */}
              <span className={`text-[9px] font-bold uppercase tracking-wide transition-colors text-center leading-tight ${colored ? 'text-primary' : 'text-white/25'}`}>
                {week.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Weight section ───────────────────────────────────────────────────────────

interface WeightSectionProps {
  userId: string;
  logs: WeightLog[];
  onLogsChange: (logs: WeightLog[]) => void;
  stats: UserStats | null;
  unlockedAchievementKeys: Set<string>;
  onStatsUpdated: (stats: UserStats, newAchievements?: Achievement[]) => void;
}

function WeightSection({ userId, logs, onLogsChange, stats, unlockedAchievementKeys, onStatsUpdated }: WeightSectionProps) {
  const currentKey = getCurrentWeekKey();
  const [selectedKey, setSelectedKey] = useState(currentKey);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const weeks = buildWeeks(logs);
  const selectedWeek = weeks.find((w) => w.key === selectedKey);
  const selectedEntries = selectedWeek?.entries ?? [];

  const isCurrentWeek = selectedKey === currentKey;

  async function handleSave(date: string) {
    const w = parseFloat(editValue);
    if (isNaN(w) || w <= 0) return;
    try {
      await logWeight(userId, date, w);
      const isNew = !logs.find((l) => l.date === date);
      const updatedLogs = isNew
        ? [...logs, { id: crypto.randomUUID(), userId, date, weight: w }]
        : logs.map((l) => l.date === date ? { ...l, weight: w } : l);
      onLogsChange(updatedLogs);
      setEditingDate(null);

      // Award weight points once/week on new entries
      if (isNew && stats) {
        const updatedStats = awardWeightPoints(stats);
        if (updatedStats) {
          const [goals] = await Promise.all([getGoals(userId)]);
          const weightGoal = goals.find((g) => g.type === 'weight');
          const newKeys = checkAchievements(
            {
              totalWeightLogs: updatedLogs.length,
              currentWeightKg: w,
              weightGoalKg: weightGoal?.targetValue,
            },
            unlockedAchievementKeys
          );
          let finalStats = updatedStats;
          const newAchievements: Achievement[] = [];
          for (const key of newKeys) {
            const def = ACHIEVEMENT_MAP[key];
            if (def) {
              const a = await unlockAchievement(userId, key, def.bonusPoints);
              if (a) {
                newAchievements.push(a);
                finalStats = { ...finalStats, totalPoints: finalStats.totalPoints + def.bonusPoints };
              }
            }
          }
          await upsertUserStats(finalStats);
          onStatsUpdated(finalStats, newAchievements);
        }
      }
    } catch {
      toast.error('Failed to update weight');
    }
  }

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-lexend font-bold text-base text-white">Weight Progress</p>
          <p className="text-xs text-white/30 uppercase tracking-widest mt-0.5">weekly average · kg</p>
        </div>
        {selectedWeek && (
          <div className="text-right">
            <p className="text-lg font-bold font-mono-timer text-white">{selectedWeek.avg} kg</p>
            <p className="text-[10px] text-white/30 uppercase tracking-widest">
              {isCurrentWeek ? 'this week' : selectedWeek.label}
            </p>
          </div>
        )}
      </div>

      <WeightBarChart
        weeks={weeks}
        selectedKey={selectedKey}
        currentKey={currentKey}
        onSelect={setSelectedKey}
      />

      {/* Selected week entries */}
      {selectedEntries.length > 0 && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-2">
            {isCurrentWeek ? 'This week' : selectedWeek?.label + ' week'}
          </p>
          <div className="space-y-0 divide-y divide-white/5">
            {[...selectedEntries]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((log) => (
                <div key={log.date} className="flex items-center justify-between py-2.5">
                  <span className="text-xs text-white/40">{fullDate(log.date)}</span>

                  {editingDate === log.date ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSave(log.date);
                          if (e.key === 'Escape') setEditingDate(null);
                        }}
                        className="w-20 h-8 bg-white/5 border border-primary/40 rounded-lg px-2 text-white text-sm font-mono-timer text-center focus:outline-none"
                        step="0.1"
                        min="0"
                        inputMode="decimal"
                      />
                      <span className="text-xs text-white/30">kg</span>
                      <button
                        onClick={() => handleSave(log.date)}
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-primary/20 text-primary tap-scale"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        onClick={() => setEditingDate(null)}
                        className="h-8 w-8 flex items-center justify-center rounded-lg glass-card text-white/40 tap-scale"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-white font-mono-timer">{log.weight} kg</span>
                      <button
                        onClick={() => { setEditingDate(log.date); setEditValue(String(log.weight)); }}
                        className="h-7 w-7 flex items-center justify-center rounded-lg glass-card text-white/30 tap-scale hover:text-white/60 transition-colors"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {selectedEntries.length === 0 && selectedWeek && (
        <p className="text-xs text-white/25 mt-4 text-center">No entries for this week.</p>
      )}
    </div>
  );
}

// ─── Exercise accordion ───────────────────────────────────────────────────────

function ExerciseAccordion({ chart, divRef, autoOpen }: { chart: ExerciseChart; divRef?: (el: HTMLDivElement | null) => void; autoOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(autoOpen ?? false);
  const pb = chart.data.length > 0 ? Math.max(...chart.data.map((d) => d.value)) : null;

  return (
    <div ref={divRef} className="glass-card rounded-2xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 tap-scale text-left"
      >
        <div>
          <p className="font-lexend font-bold text-base text-white">{chart.name}</p>
          <p className="text-xs text-white/30 mt-0.5 uppercase tracking-widest">
            {chart.yLabel}{pb != null ? ` · PB: ${pb}` : ''}
          </p>
        </div>
        {isOpen
          ? <ChevronUp size={16} className="text-white/30 flex-shrink-0" />
          : <ChevronDown size={16} className="text-white/30 flex-shrink-0" />}
      </button>

      {isOpen && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3">
          <ExerciseLineChart data={chart.data} />
        </div>
      )}
    </div>
  );
}

// ─── ProgressView ─────────────────────────────────────────────────────────────

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
  return `${sec}s`;
}

export default function ProgressView({ userId, stats, unlockedAchievementKeys, scrollToSection, onScrollHandled, onStatsUpdated }: ProgressViewProps) {
  const [charts, setCharts] = useState<ExerciseChart[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [personalBests, setPersonalBests] = useState<PersonalBest[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const pbsRef = useRef<HTMLDivElement>(null);
  const chartRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    Promise.all([getWorkoutSessions(userId), getWeightLogs(userId), getPersonalBests(userId)])
      .then(([rawSessions, wlogs, pbs]) => {
        setCharts(buildCharts(rawSessions));
        setWeightLogs(wlogs);
        setPersonalBests(pbs);
        setSessions([...rawSessions].sort((a, b) => b.date.localeCompare(a.date)));
      })
      .catch(() => toast.error('Failed to load progress'))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!scrollToSection || loading) return;
    const ref = scrollToSection === 'history' ? historyRef : pbsRef;
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onScrollHandled?.();
    }, 150);
  }, [scrollToSection, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-white/30 text-sm uppercase tracking-widest">Loading...</span>
      </div>
    );
  }

  return (
    <div className="px-5 pt-5 pb-4 space-y-6">
      <h2 className="font-lexend font-bold text-2xl text-white">Progress</h2>

      {/* Weight Progress */}
      {weightLogs.length > 0 ? (
        <WeightSection
          userId={userId}
          logs={weightLogs}
          onLogsChange={setWeightLogs}
          stats={stats}
          unlockedAchievementKeys={unlockedAchievementKeys}
          onStatsUpdated={onStatsUpdated}
        />
      ) : (
        <div className="glass-card rounded-2xl p-6 text-center">
          <p className="font-lexend font-bold text-base text-white mb-1">Weight Progress</p>
          <p className="text-white/25 text-xs">Log your weight on the Home tab to see progress here.</p>
        </div>
      )}

      {/* Personal Bests */}
      {personalBests.length > 0 && (
        <div ref={pbsRef}>
          <h3 className="font-lexend font-bold text-lg text-white mb-3">Personal Bests</h3>
          <div className="space-y-2">
            {personalBests.map((pb) => {
              const matchingChart = charts.find((c) => c.name.toLowerCase() === pb.exerciseName.toLowerCase());
              return (
                <button
                  key={`${pb.exerciseName}-${pb.trackingType}`}
                  onClick={() => {
                    if (!matchingChart) return;
                    const el = chartRefs.current.get(matchingChart.name);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  disabled={!matchingChart}
                  className={`w-full glass-card rounded-xl px-4 py-3 text-left ${matchingChart ? 'tap-scale' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-white text-sm truncate">{pb.exerciseName}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mt-0.5">
                        {pb.trackingType === 'reps_weight' ? 'Reps + Weight'
                          : pb.trackingType === 'bodyweight_reps' ? 'Bodyweight'
                          : pb.trackingType === 'duration' ? 'Time'
                          : 'Distance + Time'}
                        {matchingChart && <span className="text-primary/60"> · tap to see chart</span>}
                      </p>
                    </div>
                    <div className="flex gap-4 flex-shrink-0">
                      {pb.bestWeightKg != null && (
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Weight</p>
                          <p className="font-lexend font-bold text-primary">{pb.bestWeightKg} kg</p>
                        </div>
                      )}
                      {pb.bestReps != null && (
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Best Reps</p>
                          <p className="font-lexend font-bold text-white">{pb.bestReps}</p>
                        </div>
                      )}
                      {pb.bestDurationS != null && (
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Best Time</p>
                          <p className="font-lexend font-bold text-white">
                            {pb.bestDurationS >= 60
                              ? `${Math.floor(pb.bestDurationS / 60)}m ${Math.round(pb.bestDurationS % 60)}s`
                              : `${Math.round(pb.bestDurationS)}s`}
                          </p>
                        </div>
                      )}
                      {pb.bestDistanceM != null && (
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Distance</p>
                          <p className="font-lexend font-bold text-white">
                            {pb.bestDistanceM >= 1000 ? `${(pb.bestDistanceM / 1000).toFixed(1)} km` : `${Math.round(pb.bestDistanceM)} m`}
                          </p>
                        </div>
                      )}
                      {pb.totalReps > 0 && pb.trackingType !== 'reps_weight' && (
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Total Reps</p>
                          <p className="font-lexend font-bold text-white">{pb.totalReps.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Training Progress */}
      <div>
        <h3 className="font-lexend font-bold text-lg text-white mb-3">Training Progress</h3>
        {charts.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <TrendingUp size={32} className="text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No data yet.</p>
            <p className="text-white/20 text-xs mt-1">Complete sessions to see progress charts.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {charts.map((chart) => (
              <ExerciseAccordion
                key={chart.name}
                chart={chart}
                divRef={(el) => {
                  if (el) chartRefs.current.set(chart.name, el);
                  else chartRefs.current.delete(chart.name);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Workout History */}
      <div ref={historyRef}>
        <h3 className="font-lexend font-bold text-lg text-white mb-3">History</h3>
        {sessions.length === 0 ? (
          <div className="glass-card rounded-2xl p-6 text-center">
            <p className="text-white/25 text-xs">No sessions yet. Complete a workout to see your history.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const dateLabel = new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              const isExpanded = expandedSessionId === s.id;
              return (
                <div key={s.id} className="glass-card rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedSessionId(isExpanded ? null : s.id)}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 tap-scale text-left"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-white text-sm truncate">{s.workoutName}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mt-0.5">{dateLabel}</p>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="flex gap-4 text-right">
                        {s.durationSeconds != null && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Duration</p>
                            <p className="font-mono-timer font-bold text-white/70 text-sm">{formatDuration(s.durationSeconds)}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Exercises</p>
                          <p className="font-mono-timer font-bold text-white/70 text-sm">{s.exercises.length}</p>
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-white/5 px-4 pb-3 pt-2 space-y-2">
                      {s.exercises.map((ex, i) => (
                        <div key={i} className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm text-white/80 font-bold truncate">{ex.exerciseName}</p>
                            <p className="text-[10px] text-white/30 uppercase tracking-widest">{ex.sets.length} set{ex.sets.length !== 1 ? 's' : ''}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {ex.trackingType === 'reps_weight' && ex.sets.map((set, si) => {
                              const s2 = set as { reps: number; weight: number };
                              return <p key={si} className="text-xs text-white/50 font-mono-timer">{s2.reps} × {s2.weight} kg</p>;
                            })}
                            {ex.trackingType === 'bodyweight_reps' && ex.sets.map((set, si) => {
                              const s2 = set as { reps: number };
                              return <p key={si} className="text-xs text-white/50 font-mono-timer">{s2.reps} reps</p>;
                            })}
                            {ex.trackingType === 'duration' && ex.sets.map((set, si) => {
                              const s2 = set as { time: number };
                              return <p key={si} className="text-xs text-white/50 font-mono-timer">{Math.round(s2.time)}s</p>;
                            })}
                            {ex.trackingType === 'distance_time' && ex.sets.map((set, si) => {
                              const s2 = set as { distance: number; time: number };
                              return <p key={si} className="text-xs text-white/50 font-mono-timer">{s2.distance}m in {Math.round(s2.time)}s</p>;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
