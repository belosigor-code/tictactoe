import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { getWorkoutSessions, saveWorkoutSession, upsertUserStats, unlockAchievement, getPersonalBests, upsertPersonalBest } from '@/lib/storage';
import type {
  WorkoutTemplate,
  ExerciseTemplate,
  TrackingType,
  ExerciseLog,
  SetLog,
  DurationSetLog,
  RepsWeightSetLog,
  DistanceTimeSetLog,
  BodyweightRepsSetLog,
  WorkoutSession,
  UserStats,
  Achievement,
} from '@/lib/types';
import {
  awardWorkoutPoints,
  checkAchievements,
  computePersonalBestUpdates,
  ACHIEVEMENT_MAP,
  getStreakDef,
} from '@/lib/gamification';
import { RefreshCw } from 'lucide-react';

// ─── Internal Types ───────────────────────────────────────────────────────────

type SetState = 'idle' | 'running' | 'stopped' | 'saved';

interface BaseSetData {
  state: SetState;
  elapsed: number;       // timer seconds (0 when idle/saved)
  setStartedAt?: number; // epoch ms when set became active
}

interface DurationSetData extends BaseSetData {}

interface RepsWeightSetData extends BaseSetData {
  reps: string;
  weight: string;
}

interface DistanceTimeSetData extends BaseSetData {
  distance: string;
}

interface BodyweightRepsSetData extends BaseSetData {
  reps: string;
}

type SetData = DurationSetData | RepsWeightSetData | DistanceTimeSetData | BodyweightRepsSetData;

interface ExerciseState {
  exercise: ExerciseTemplate;
  currentTrackingType: TrackingType;
  sets: SetData[];
}

interface CircularCursor {
  round: number;
  exerciseIndex: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(seconds: number): string {
  const s = Math.floor(seconds);
  const dec = Math.floor((seconds - s) * 10);
  const m = Math.floor(s / 60);
  const secs = s % 60;
  if (m > 0) return `${m}:${String(secs).padStart(2, '0')}`;
  return `${secs}.${dec}s`;
}


function initSets(exercise: ExerciseTemplate, prevSets?: SetLog[]): SetData[] {
  return Array.from({ length: exercise.sets }, (_, i) => {
    const prev = prevSets?.[i];
    if (exercise.trackingType === 'duration') {
      return { state: 'idle', elapsed: 0 } as DurationSetData;
    } else if (exercise.trackingType === 'reps_weight') {
      const p = prev as RepsWeightSetLog | undefined;
      return { state: 'idle', elapsed: 0, reps: p ? String(p.reps) : '', weight: p ? String(p.weight) : '' } as RepsWeightSetData;
    } else if (exercise.trackingType === 'bodyweight_reps') {
      const p = prev as BodyweightRepsSetLog | undefined;
      return { state: 'idle', elapsed: 0, reps: p ? String(p.reps) : '' } as BodyweightRepsSetData;
    } else {
      const p = prev as DistanceTimeSetLog | undefined;
      return { state: 'idle', elapsed: 0, distance: p ? String(p.distance) : '' } as DistanceTimeSetData;
    }
  });
}

function makeInitialSets(trackingType: TrackingType, count: number): SetData[] {
  return Array.from({ length: count }, () => {
    if (trackingType === 'duration') return { state: 'idle', elapsed: 0 } as DurationSetData;
    if (trackingType === 'reps_weight') return { state: 'idle', elapsed: 0, reps: '', weight: '' } as RepsWeightSetData;
    if (trackingType === 'bodyweight_reps') return { state: 'idle', elapsed: 0, reps: '' } as BodyweightRepsSetData;
    return { state: 'idle', elapsed: 0, distance: '' } as DistanceTimeSetData;
  });
}

function advanceCircular(states: ExerciseState[], cursor: CircularCursor): CircularCursor | null {
  const { round, exerciseIndex } = cursor;
  for (let ei = exerciseIndex + 1; ei < states.length; ei++) {
    if (states[ei].sets[round] && states[ei].sets[round].state !== 'saved') {
      return { round, exerciseIndex: ei };
    }
  }
  for (let r = round + 1; r < 20; r++) {
    for (let ei = 0; ei < states.length; ei++) {
      if (states[ei].sets[r] && states[ei].sets[r].state !== 'saved') {
        return { round: r, exerciseIndex: ei };
      }
    }
  }
  return null;
}

// ─── Rest Timer ───────────────────────────────────────────────────────────────

const REST_DURATION_S = 90;

function RestTimer({ startedAt, onSkip }: { startedAt: number; onSkip: () => void }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, REST_DURATION_S - Math.floor((Date.now() - startedAt) / 1000)));

  useEffect(() => {
    const id = setInterval(() => {
      const r = Math.max(0, REST_DURATION_S - Math.floor((Date.now() - startedAt) / 1000));
      setRemaining(r);
      if (r === 0) onSkip();
    }, 500);
    return () => clearInterval(id);
  }, [startedAt, onSkip]);

  const pct = Math.round((remaining / REST_DURATION_S) * 100);
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  const display = `${m}:${String(s).padStart(2, '0')}`;

  return (
    <div className="border-t border-white/5 mt-1 px-1 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/30 flex-shrink-0">REST</span>
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/60 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono-timer text-base font-bold text-white/60 flex-shrink-0">{display}</span>
        </div>
        <button
          onClick={onSkip}
          className="text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors tap-scale flex-shrink-0"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// ─── Tracking type picker ─────────────────────────────────────────────────────

const TRACKING_OPTIONS: { value: TrackingType; label: string }[] = [
  { value: 'reps_weight', label: 'Reps + Weight' },
  { value: 'bodyweight_reps', label: 'Bodyweight' },
  { value: 'duration', label: 'Duration' },
  { value: 'distance_time', label: 'Dist + Time' },
];

// ─── SetRow ───────────────────────────────────────────────────────────────────
// Unified flow for all tracking types:
//   idle → (START) → running → (PAUSE) → stopped → (RESUME) → running
//                             → (RESET) → idle
//                             → (SAVE) → saved

interface SetRowProps {
  trackingType: TrackingType;
  setIndex: number;
  setData: SetData;
  isActiveTimer: boolean;
  onChange: (data: SetData) => void;
  onTimerStart: () => void;
  onTimerStop: () => void;
  onBreakClear: () => void;
}

function SetRow({
  trackingType,
  setIndex,
  setData,
  isActiveTimer,
  onChange,
  onTimerStart,
  onTimerStop,
  onBreakClear,
}: SetRowProps) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const elapsedBeforeRef = useRef<number>(0);
  const dataRef = useRef<SetData>(setData);

  useEffect(() => { dataRef.current = setData; }, [setData]);
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  function startTimer() {
    const now = Date.now();
    const currentElapsed = setData.elapsed;
    startTimeRef.current = now;
    elapsedBeforeRef.current = currentElapsed;
    onTimerStart();
    onBreakClear();
    intervalRef.current = setInterval(() => {
      const elapsed = elapsedBeforeRef.current + (Date.now() - startTimeRef.current) / 1000;
      onChange({ ...dataRef.current, state: 'running', elapsed });
    }, 100);
    onChange({ ...setData, state: 'running', elapsed: currentElapsed, setStartedAt: setData.setStartedAt ?? now });
  }

  function pauseTimer() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    onTimerStop();
    const elapsed = elapsedBeforeRef.current + (Date.now() - startTimeRef.current) / 1000;
    onChange({ ...dataRef.current, state: 'stopped', elapsed });
  }

  function resetSet() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    onTimerStop();
    onChange({ ...setData, state: 'idle', elapsed: 0, setStartedAt: undefined } as SetData);
  }

  function saveSet() {
    let finalElapsed = setData.elapsed;
    if (setData.state === 'running') {
      finalElapsed = elapsedBeforeRef.current + (Date.now() - startTimeRef.current) / 1000;
    }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    onTimerStop();
    onChange({ ...dataRef.current, state: 'saved', elapsed: finalElapsed } as SetData);
  }

  // ── SAVED ──
  if (setData.state === 'saved') {
    let valueText = '';
    if (trackingType === 'duration') {
      valueText = fmt(setData.elapsed);
    } else if (trackingType === 'reps_weight') {
      const d = setData as RepsWeightSetData;
      valueText = `${d.reps} × ${d.weight} kg`;
    } else if (trackingType === 'bodyweight_reps') {
      valueText = `${(setData as BodyweightRepsSetData).reps} reps`;
    } else {
      const d = setData as DistanceTimeSetData;
      valueText = `${d.distance}m · ${fmt(d.elapsed)}`;
    }
    return (
      <div className="flex items-center justify-between py-1.5 px-1">
        <span className="text-xs text-white/30 font-mono-timer">Set {setIndex + 1}</span>
        <span className="text-xs text-white/60 font-mono-timer font-bold">{valueText}</span>
      </div>
    );
  }

  // ── IDLE ──
  if (setData.state === 'idle') {
    return (
      <div className="py-2 px-1">
        <button
          onClick={startTimer}
          disabled={isActiveTimer}
          className="w-full h-12 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/60 tap-scale disabled:opacity-30 hover:border-white/20 transition-colors"
        >
          START SET {setIndex + 1}
        </button>
      </div>
    );
  }

  // ── RUNNING / STOPPED ──
  const isRunning = setData.state === 'running';

  // Can we save?
  let canSave = true;
  if (trackingType === 'reps_weight') {
    const d = setData as RepsWeightSetData;
    canSave = !!d.reps && !!d.weight;
  } else if (trackingType === 'bodyweight_reps') {
    canSave = !!(setData as BodyweightRepsSetData).reps;
  } else if (trackingType === 'distance_time') {
    canSave = !!(setData as DistanceTimeSetData).distance;
  }

  return (
    <div className="py-3 px-1 space-y-3">
      {/* Timer + control row */}
      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono-timer text-2xl font-bold tabular-nums ${isRunning ? 'text-primary text-glow-primary' : 'text-white/50'}`}>
          {fmt(setData.elapsed)}
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={resetSet}
            className="h-9 px-3 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/40 tap-scale"
          >
            RESET
          </button>
          <button
            onClick={isRunning ? pauseTimer : startTimer}
            className="h-9 px-4 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/70 tap-scale border-white/20"
          >
            {isRunning ? 'PAUSE' : 'RESUME'}
          </button>
        </div>
      </div>

      {/* Inputs (non-duration types) */}
      {trackingType === 'reps_weight' && (
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1.5">REPS</label>
            <input
              type="number"
              value={(setData as RepsWeightSetData).reps}
              onChange={(e) => onChange({ ...dataRef.current, reps: e.target.value } as RepsWeightSetData)}
              className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-3 text-white text-lg font-mono-timer text-center focus:outline-none focus:border-primary/60 transition-colors"
              placeholder="0"
              min="0"
              inputMode="numeric"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1.5">KG</label>
            <input
              type="number"
              value={(setData as RepsWeightSetData).weight}
              onChange={(e) => onChange({ ...dataRef.current, weight: e.target.value } as RepsWeightSetData)}
              className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-3 text-white text-lg font-mono-timer text-center focus:outline-none focus:border-primary/60 transition-colors"
              placeholder="0"
              min="0"
              inputMode="decimal"
            />
          </div>
        </div>
      )}

      {trackingType === 'bodyweight_reps' && (
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1.5">REPS</label>
          <input
            type="number"
            value={(setData as BodyweightRepsSetData).reps}
            onChange={(e) => onChange({ ...dataRef.current, reps: e.target.value } as BodyweightRepsSetData)}
            className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-3 text-white text-lg font-mono-timer text-center focus:outline-none focus:border-primary/60 transition-colors"
            placeholder="0"
            min="0"
            inputMode="numeric"
          />
        </div>
      )}

      {trackingType === 'distance_time' && (
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1.5">DISTANCE (m)</label>
          <input
            type="number"
            value={(setData as DistanceTimeSetData).distance}
            onChange={(e) => onChange({ ...dataRef.current, distance: e.target.value } as DistanceTimeSetData)}
            className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-3 text-white text-lg font-mono-timer text-center focus:outline-none focus:border-primary/60 transition-colors"
            placeholder="0"
            min="0"
            inputMode="decimal"
          />
        </div>
      )}

      {/* Save button */}
      <button
        onClick={saveSet}
        disabled={!canSave}
        className="w-full h-11 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase tracking-widest tap-scale disabled:opacity-30 glow-primary-sm"
      >
        SAVE SET {setIndex + 1}
      </button>
    </div>
  );
}

// ─── ExerciseCard ─────────────────────────────────────────────────────────────

interface ExerciseCardProps {
  exerciseState: ExerciseState;
  activeTimerKey: string | null;
  isActive: boolean;
  circularRound: number | null;
  breakStartedAt: number | null;
  onSetChange: (setIndex: number, data: SetData) => void;
  onTimerStart: (key: string) => void;
  onTimerStop: () => void;
  onBreakStart: () => void;
  onBreakClear: () => void;
  onTrackingTypeChange: (newType: TrackingType) => void;
}

function ExerciseCard({
  exerciseState,
  activeTimerKey,
  isActive,
  circularRound,
  breakStartedAt,
  onSetChange,
  onTimerStart,
  onTimerStop,
  onBreakStart,
  onBreakClear,
  onTrackingTypeChange,
}: ExerciseCardProps) {
  const { exercise, currentTrackingType, sets } = exerciseState;
  const [showTypePicker, setShowTypePicker] = useState(false);

  const savedCount = sets.filter((s) => s.state === 'saved').length;
  const totalSets = sets.length;
  const isComplete = savedCount === totalSets;

  // Active set index: in circular mode = current round, in linear = first non-saved
  const activeSetIndex = circularRound !== null
    ? circularRound
    : sets.findIndex((s) => s.state !== 'saved');

  // Collapse when not the active exercise (or when complete)
  const isCollapsed = !isActive;

  function wrappedOnChange(setIndex: number, data: SetData, prevData: SetData) {
    if (data.state === 'saved' && prevData.state !== 'saved') {
      onSetChange(setIndex, data);
      onBreakStart();
    } else {
      onSetChange(setIndex, data);
    }
  }

  // ── Collapsed card ──
  if (isCollapsed) {
    return (
      <div className={`glass-card rounded-2xl p-4 mb-3 transition-opacity ${isComplete ? 'opacity-40' : 'opacity-50'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-lexend font-bold text-base text-white/70">{exercise.name}</p>
            <p className="text-xs text-white/30 mt-0.5">
              {isComplete ? 'Complete' : `${savedCount}/${totalSets} sets done`}
            </p>
          </div>
          <div className="h-1.5 w-20 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${isComplete ? 'bg-primary' : 'bg-primary/40'}`}
              style={{ width: `${totalSets > 0 ? (savedCount / totalSets) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Expanded (active) card ──
  return (
    <div className="glass-card rounded-2xl p-4 mb-3 border border-primary/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-lexend font-bold text-base text-white">{exercise.name}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white/30 font-mono-timer">{savedCount}/{totalSets}</span>
          <button
            onClick={() => setShowTypePicker(!showTypePicker)}
            className="h-7 w-7 flex items-center justify-center rounded-lg bg-white/5 tap-scale text-white/30 hover:text-white/60 transition-colors"
            title="Change tracking type"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Tracking type picker */}
      {showTypePicker && (
        <div className="mb-3 p-2 bg-white/5 rounded-xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2 px-1">
            Change tracking type (clears saved sets)
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {TRACKING_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onTrackingTypeChange(opt.value); setShowTypePicker(false); }}
                className={`h-9 text-xs font-bold uppercase tracking-wide rounded-lg tap-scale transition-all ${
                  currentTrackingType === opt.value
                    ? 'bg-primary text-primary-foreground glow-primary-sm'
                    : 'bg-white/5 text-white/50 hover:text-white/70'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all ${isComplete ? 'bg-primary' : 'bg-primary/60'}`}
          style={{ width: `${totalSets > 0 ? (savedCount / totalSets) * 100 : 0}%` }}
        />
      </div>

      {/* Sets */}
      <div className="divide-y divide-white/5">
        {sets.map((setData, i) => {
          // Show: saved sets + current active set only
          const visible = setData.state === 'saved' || i === activeSetIndex;
          if (!visible) return null;

          const key = `${exercise.id}-${i}`;
          const isActiveTimer = activeTimerKey !== null && activeTimerKey !== key;

          return (
            <SetRow
              key={i}
              trackingType={currentTrackingType}
              setIndex={i}
              setData={setData}
              isActiveTimer={isActiveTimer}
              onChange={(data) => wrappedOnChange(i, data, setData)}
              onTimerStart={() => onTimerStart(key)}
              onTimerStop={onTimerStop}
              onBreakClear={onBreakClear}
            />
          );
        })}
      </div>

      {/* Rest countdown — after a set is saved, before the next one starts */}
      {breakStartedAt !== null && !isComplete && (
        <RestTimer startedAt={breakStartedAt} onSkip={onBreakClear} />
      )}
    </div>
  );
}

// ─── WorkoutView ──────────────────────────────────────────────────────────────

interface WorkoutViewProps {
  userId: string;
  template: WorkoutTemplate;
  timerPaused: boolean;
  onFinish: () => void;
  onAbort: () => void;
  getElapsedSeconds: () => number;
  stats: UserStats | null;
  unlockedAchievementKeys: Set<string>;
  onStatsUpdated: (stats: UserStats, newAchievements: Achievement[]) => void;
}

export default function WorkoutView({
  userId,
  template,
  timerPaused,
  onFinish,
  onAbort,
  getElapsedSeconds,
  stats,
  unlockedAchievementKeys,
  onStatsUpdated,
}: WorkoutViewProps) {
  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([]);
  const [activeTimerKey, setActiveTimerKey] = useState<string | null>(null);
  const [breakStartedAt, setBreakStartedAt] = useState<number | null>(null);
  const [circularCursor, setCircularCursor] = useState<CircularCursor | null>(
    (template.mode ?? 'linear') === 'circular' ? { round: 0, exerciseIndex: 0 } : null
  );
  const [showFinishDialog, setShowFinishDialog] = useState(false);
  const [showAbortDialog, setShowAbortDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    getWorkoutSessions(userId).then((sessions) => {
      const lastSets: Record<string, SetLog[]> = {};
      for (const session of sessions) {
        for (const exLog of session.exercises) {
          lastSets[exLog.exerciseName.toLowerCase()] = exLog.sets;
        }
      }
      setExerciseStates(
        template.exercises.map((ex) => ({
          exercise: ex,
          currentTrackingType: ex.trackingType,
          sets: initSets(ex, lastSets[ex.name.toLowerCase()]),
        }))
      );
    });
  }, [userId, template]);

  useEffect(() => {
    function handleStop() { setShowAbortDialog(true); }
    document.addEventListener('zts:stop-workout', handleStop);
    return () => document.removeEventListener('zts:stop-workout', handleStop);
  }, []);

  const handleSetChange = useCallback((exerciseIndex: number, setIndex: number, data: SetData) => {
    setExerciseStates((prev) =>
      prev.map((es, ei) => {
        if (ei !== exerciseIndex) return es;
        const sets = [...es.sets];
        sets[setIndex] = data;
        return { ...es, sets };
      })
    );
  }, []);

  const handleBreakStart = useCallback(() => {
    setBreakStartedAt(Date.now());
    // Advance circular cursor if in circular mode
    if (circularCursor !== null) {
      setExerciseStates((prev) => {
        const next = advanceCircular(prev, circularCursor);
        if (next) setCircularCursor(next);
        return prev;
      });
    }
  }, [circularCursor]);

  const handleBreakClear = useCallback(() => {
    setBreakStartedAt(null);
  }, []);

  const handleTrackingTypeChange = useCallback((exerciseIndex: number, newType: TrackingType) => {
    setExerciseStates((prev) =>
      prev.map((es, ei) => {
        if (ei !== exerciseIndex) return es;
        return {
          ...es,
          currentTrackingType: newType,
          sets: makeInitialSets(newType, es.exercise.sets),
        };
      })
    );
  }, []);

  async function handleFinish() {
    setSaving(true);
    try {
      const exerciseLogs: ExerciseLog[] = exerciseStates
        .map((es) => {
          const savedSets = es.sets
            .filter((s) => s.state === 'saved')
            .map((s): SetLog => {
              if (es.currentTrackingType === 'duration') {
                return { time: parseFloat(s.elapsed.toFixed(1)), setDurationSeconds: (s as BaseSetData).setStartedAt ? parseFloat(((Date.now() - (s as BaseSetData).setStartedAt!) / 1000).toFixed(1)) : undefined } as DurationSetLog;
              } else if (es.currentTrackingType === 'reps_weight') {
                const d = s as RepsWeightSetData;
                return { reps: Number(d.reps), weight: Number(d.weight) } as RepsWeightSetLog;
              } else if (es.currentTrackingType === 'bodyweight_reps') {
                const d = s as BodyweightRepsSetData;
                return { reps: Number(d.reps) } as BodyweightRepsSetLog;
              } else {
                const d = s as DistanceTimeSetData;
                return { distance: Number(d.distance), time: parseFloat(d.elapsed.toFixed(1)) } as DistanceTimeSetLog;
              }
            });
          if (savedSets.length === 0) return null;
          return {
            exerciseId: es.exercise.id,
            exerciseName: es.exercise.name,
            trackingType: es.currentTrackingType,
            sets: savedSets,
          } as ExerciseLog;
        })
        .filter((e): e is ExerciseLog => e !== null);

      const session: WorkoutSession = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        workoutTemplateId: template.id,
        workoutName: template.name,
        exercises: exerciseLogs,
        durationSeconds: Math.round(getElapsedSeconds()),
      };

      await saveWorkoutSession(userId, session);

      // Gamification: points + personal bests + achievements
      try {
        if (stats) {
          const [existingPBs, allSessions] = await Promise.all([
            getPersonalBests(userId),
            getWorkoutSessions(userId),
          ]);

          // Personal bests
          const { updates, isNewRecord } = computePersonalBestUpdates(session, existingPBs);
          for (const pb of updates) {
            await upsertPersonalBest(userId, pb);
          }

          // Fastest workout
          const durationS = session.durationSeconds ?? null;
          const isNewFastest = durationS != null && (stats.fastestWorkoutS == null || durationS < stats.fastestWorkoutS);

          // Points
          let updatedStats = awardWorkoutPoints(stats);
          if (isNewFastest) updatedStats = { ...updatedStats, fastestWorkoutS: durationS };

          // Achievement checks
          const newKeys = checkAchievements(
            {
              totalWorkouts: allSessions.length,
              isNewPB: isNewRecord,
              isNewFastestWorkout: isNewFastest,
            },
            unlockedAchievementKeys
          );

          const newAchievements: Achievement[] = [];
          for (const key of newKeys) {
            const def = ACHIEVEMENT_MAP[key] ?? getStreakDef(0);
            const a = await unlockAchievement(userId, key, def.bonusPoints);
            if (a) {
              newAchievements.push(a);
              updatedStats = { ...updatedStats, totalPoints: updatedStats.totalPoints + def.bonusPoints };
            }
          }

          await upsertUserStats(updatedStats);
          onStatsUpdated(updatedStats, newAchievements);
        }
      } catch { /* non-critical */ }

      onFinish();
    } catch {
      toast.error('Failed to save session');
      setSaving(false);
      setShowFinishDialog(false);
    }
  }

  if (exerciseStates.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-white/30 text-sm uppercase tracking-widest">Loading...</span>
      </div>
    );
  }

  const isCircular = circularCursor !== null;

  // In linear mode, the active exercise is the first one with any non-saved set
  const linearActiveIndex = isCircular
    ? -1
    : exerciseStates.findIndex((es) => es.sets.some((s) => s.state !== 'saved'));

  return (
    <div className="px-5 pt-5 pb-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-lexend font-bold text-xl text-white">{template.name}</h2>
          {isCircular && (
            <p className="text-xs text-white/30 mt-0.5 uppercase tracking-widest">
              Round {circularCursor.round + 1} · Exercise {circularCursor.exerciseIndex + 1}/{exerciseStates.length}
            </p>
          )}
        </div>
        {timerPaused && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 rounded-full px-2 py-1">
            PAUSED
          </span>
        )}
      </div>

      {exerciseStates.map((es, ei) => {
        const isActive = isCircular
          ? circularCursor.exerciseIndex === ei
          : linearActiveIndex === ei;

        return (
          <ExerciseCard
            key={es.exercise.id}
            exerciseState={es}
            activeTimerKey={activeTimerKey}
            isActive={isActive}
            circularRound={isCircular ? circularCursor.round : null}
            breakStartedAt={isActive ? breakStartedAt : null}
            onSetChange={(si, data) => handleSetChange(ei, si, data)}
            onTimerStart={(key) => setActiveTimerKey(key)}
            onTimerStop={() => setActiveTimerKey(null)}
            onBreakStart={handleBreakStart}
            onBreakClear={handleBreakClear}
            onTrackingTypeChange={(newType) => handleTrackingTypeChange(ei, newType)}
          />
        );
      })}

      <button
        onClick={() => setShowFinishDialog(true)}
        className="w-full h-14 bg-primary text-primary-foreground rounded-xl text-sm font-bold uppercase tracking-widest tap-scale glow-primary mt-2"
      >
        FINISH WORKOUT
      </button>

      {/* Finish dialog */}
      {showFinishDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm glass-card rounded-2xl p-6">
            <h3 className="font-lexend font-bold text-xl text-white mb-2">Finish workout?</h3>
            <p className="text-sm text-white/40 mb-6">Only saved sets will be recorded.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFinishDialog(false)}
                className="flex-1 h-12 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/50 tap-scale"
              >
                CANCEL
              </button>
              <button
                onClick={handleFinish}
                disabled={saving}
                className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase tracking-widest tap-scale glow-primary disabled:opacity-50"
              >
                {saving ? '...' : 'FINISH'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Abort dialog */}
      {showAbortDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm glass-card rounded-2xl p-6">
            <h3 className="font-lexend font-bold text-xl text-white mb-2">Stop workout?</h3>
            <p className="text-sm text-white/40 mb-6">Progress will be lost.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAbortDialog(false)}
                className="flex-1 h-12 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/50 tap-scale"
              >
                CANCEL
              </button>
              <button
                onClick={onAbort}
                className="flex-1 h-12 bg-destructive/20 border border-destructive/40 text-destructive rounded-xl text-xs font-bold uppercase tracking-widest tap-scale"
              >
                STOP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
