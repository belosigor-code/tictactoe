import { useState } from 'react';
import { toast } from 'sonner';
import { logWeight, saveGoal, saveExercise, completeOnboarding, getUserStats, upsertUserStats } from '@/lib/storage';
import { awardAchievementBonus } from '@/lib/gamification';
import type { UserProfile, UserStats } from '@/lib/types';
import { ChevronRight, Dumbbell, Scale, Target } from 'lucide-react';
import ExerciseCatalogInput from './ExerciseCatalogInput';
import type { CatalogEntry } from '@/lib/exerciseCatalog';

interface OnboardingViewProps {
  user: UserProfile;
  onComplete: (updatedStats: UserStats) => void;
}

const TOTAL_STEPS = 5;

export default function OnboardingView({ user, onComplete }: OnboardingViewProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1
  const [currentWeight, setCurrentWeight] = useState('');
  // Step 2 — goal type picker
  const [goalType, setGoalType] = useState<'weight' | 'strength' | null>(null);
  // Step 3 — weight goal
  const [weightTarget, setWeightTarget] = useState('');
  const [weightTargetDate, setWeightTargetDate] = useState('');
  // Step 3 — strength goal
  const [strengthExercise, setStrengthExercise] = useState('');
  const [strengthExerciseEntry, setStrengthExerciseEntry] = useState<CatalogEntry | null>(null);
  const [strengthTarget, setStrengthTarget] = useState('');
  const [strengthTargetDate, setStrengthTargetDate] = useState('');
  // Step 4
  const [frequency, setFrequency] = useState('');
  // Step 5
  const [calories, setCalories] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  async function handleFinish() {
    setLoading(true);
    try {
      const promises: Promise<unknown>[] = [];

      if (currentWeight) {
        promises.push(logWeight(user.userId, today, Number(currentWeight)));
      }
      if (goalType === 'weight' && weightTarget) {
        promises.push(saveGoal(user.userId, {
          type: 'weight',
          targetValue: Number(weightTarget),
          targetDate: weightTargetDate || undefined,
        }));
      }
      if (goalType === 'strength' && strengthExercise && strengthTarget) {
        promises.push(saveGoal(user.userId, {
          type: 'strength',
          targetValue: Number(strengthTarget),
          exerciseName: strengthExercise,
          targetDate: strengthTargetDate || undefined,
        }));
        // Auto-create exercise in library
        const trackingType = strengthExerciseEntry?.trackingType ?? 'reps_weight';
        const defaultSets = strengthExerciseEntry?.defaultSets ?? 3;
        promises.push(saveExercise(user.userId, { name: strengthExercise, trackingType, defaultSets }));
      }
      if (frequency) {
        promises.push(saveGoal(user.userId, {
          type: 'frequency',
          targetValue: Number(frequency),
        }));
      }
      if (calories) {
        promises.push(saveGoal(user.userId, {
          type: 'nutrition',
          targetValue: Number(calories),
        }));
      }

      await Promise.all(promises);
      await completeOnboarding(user.userId);

      const existing = await getUserStats(user.userId);
      const base: UserStats = existing ?? {
        userId: user.userId,
        totalPoints: 0,
        streakDays: 0,
        longestStreak: 0,
        lastActiveDate: null,
        lastWeightPointsWeek: null,
        lastNutritionPointsDate: null,
        fastestWorkoutS: null,
      };
      const updated = awardAchievementBonus(base, 100);
      await upsertUserStats(updated);

      onComplete(updated);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message ?? JSON.stringify(err);
      toast.error(`Setup failed: ${msg}`);
      setLoading(false);
    }
  }

  function nextStep() { setStep((s) => s + 1); }

  const progressPct = Math.round((step / TOTAL_STEPS) * 100);

  const step3Valid = goalType === 'weight'
    ? !!weightTarget && !!weightTargetDate
    : goalType === 'strength'
      ? !!strengthExercise && !!strengthTarget && !!strengthTargetDate
      : false;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5 -mt-16">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo + title */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 border border-primary/30 mb-2">
            <Dumbbell size={26} className="text-primary" />
          </div>
          <h1 className="font-lexend font-bold text-2xl text-white">Welcome, {user.username}!</h1>
          <p className="text-sm text-white/40">Let's set up your profile in {TOTAL_STEPS} quick steps.</p>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-xs text-white/30 text-right">Step {step} of {TOTAL_STEPS}</p>
        </div>

        {/* Step content */}
        <div className="glass-card rounded-2xl p-6 space-y-5">

          {/* Step 1 — Current weight */}
          {step === 1 && (
            <>
              <div>
                <h2 className="font-lexend font-bold text-lg text-white mb-1">Current weight</h2>
                <p className="text-sm text-white/40">We'll track your progress from here.</p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">WEIGHT (KG)</label>
                <input
                  type="number"
                  value={currentWeight}
                  onChange={(e) => setCurrentWeight(e.target.value)}
                  min="0" step="0.1" autoFocus
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-lg font-mono-timer focus:outline-none focus:border-primary/60 transition-colors"
                  placeholder="e.g. 80"
                />
              </div>
              <button
                onClick={nextStep}
                disabled={!currentWeight}
                className="w-full h-12 bg-primary text-primary-foreground rounded-xl text-sm font-bold uppercase tracking-widest tap-scale glow-primary-sm flex items-center justify-center gap-2 disabled:opacity-30"
              >
                NEXT <ChevronRight size={16} />
              </button>
            </>
          )}

          {/* Step 2 — Choose primary goal type */}
          {step === 2 && (
            <>
              <div>
                <h2 className="font-lexend font-bold text-lg text-white mb-1">Primary goal</h2>
                <p className="text-sm text-white/40">What are you training towards?</p>
              </div>
              <div className="space-y-3">
                <button
                  onClick={() => setGoalType('weight')}
                  className={`w-full p-4 rounded-xl border text-left tap-scale transition-all ${
                    goalType === 'weight'
                      ? 'bg-primary/15 border-primary/60'
                      : 'glass-card border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${goalType === 'weight' ? 'bg-primary/20' : 'bg-white/5'}`}>
                      <Scale size={18} className={goalType === 'weight' ? 'text-primary' : 'text-white/40'} />
                    </div>
                    <div>
                      <p className={`font-bold text-sm ${goalType === 'weight' ? 'text-primary' : 'text-white'}`}>Dream Weight</p>
                      <p className="text-xs text-white/40 mt-0.5">Reach a target body weight</p>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setGoalType('strength')}
                  className={`w-full p-4 rounded-xl border text-left tap-scale transition-all ${
                    goalType === 'strength'
                      ? 'bg-primary/15 border-primary/60'
                      : 'glass-card border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${goalType === 'strength' ? 'bg-primary/20' : 'bg-white/5'}`}>
                      <Target size={18} className={goalType === 'strength' ? 'text-primary' : 'text-white/40'} />
                    </div>
                    <div>
                      <p className={`font-bold text-sm ${goalType === 'strength' ? 'text-primary' : 'text-white'}`}>Strength Goal</p>
                      <p className="text-xs text-white/40 mt-0.5">Hit a target lift for a specific exercise</p>
                    </div>
                  </div>
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="h-12 px-4 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/50 tap-scale">
                  BACK
                </button>
                <button
                  onClick={nextStep}
                  disabled={!goalType}
                  className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl text-sm font-bold uppercase tracking-widest tap-scale glow-primary-sm flex items-center justify-center gap-2 disabled:opacity-30"
                >
                  NEXT <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}

          {/* Step 3 — Goal details */}
          {step === 3 && goalType === 'weight' && (
            <>
              <div>
                <h2 className="font-lexend font-bold text-lg text-white mb-1">Dream Weight</h2>
                <p className="text-sm text-white/40">What weight do you want to reach?</p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">TARGET WEIGHT (KG)</label>
                <input
                  type="number"
                  value={weightTarget}
                  onChange={(e) => setWeightTarget(e.target.value)}
                  min="0" step="0.1" autoFocus
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-lg font-mono-timer focus:outline-none focus:border-primary/60 transition-colors"
                  placeholder="e.g. 75"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">TARGET DATE</label>
                <input
                  type="date"
                  value={weightTargetDate}
                  onChange={(e) => setWeightTargetDate(e.target.value)}
                  required
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-sm focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="h-12 px-4 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/50 tap-scale">
                  BACK
                </button>
                <button
                  onClick={nextStep}
                  disabled={!step3Valid}
                  className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl text-sm font-bold uppercase tracking-widest tap-scale glow-primary-sm flex items-center justify-center gap-2 disabled:opacity-30"
                >
                  NEXT <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}

          {step === 3 && goalType === 'strength' && (
            <>
              <div>
                <h2 className="font-lexend font-bold text-lg text-white mb-1">Strength Goal</h2>
                <p className="text-sm text-white/40">Which lift and what's your target?</p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">EXERCISE</label>
                <ExerciseCatalogInput
                  value={strengthExercise}
                  onChange={setStrengthExercise}
                  onSelect={(entry) => { setStrengthExercise(entry.name); setStrengthExerciseEntry(entry); }}
                  autoFocus
                  placeholder="e.g. Bench Press"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">TARGET WEIGHT (KG)</label>
                <input
                  type="number"
                  value={strengthTarget}
                  onChange={(e) => setStrengthTarget(e.target.value)}
                  min="0" step="0.5"
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-lg font-mono-timer focus:outline-none focus:border-primary/60 transition-colors"
                  placeholder="e.g. 100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">TARGET DATE</label>
                <input
                  type="date"
                  value={strengthTargetDate}
                  onChange={(e) => setStrengthTargetDate(e.target.value)}
                  required
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-sm focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="h-12 px-4 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/50 tap-scale">
                  BACK
                </button>
                <button
                  onClick={nextStep}
                  disabled={!step3Valid}
                  className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl text-sm font-bold uppercase tracking-widest tap-scale glow-primary-sm flex items-center justify-center gap-2 disabled:opacity-30"
                >
                  NEXT <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}

          {/* Step 4 — Training frequency */}
          {step === 4 && (
            <>
              <div>
                <h2 className="font-lexend font-bold text-lg text-white mb-1">Training frequency</h2>
                <p className="text-sm text-white/40">How many sessions per week are you aiming for?</p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    onClick={() => setFrequency(String(n))}
                    className={`h-12 rounded-xl text-sm font-bold tap-scale transition-all ${
                      frequency === String(n)
                        ? 'bg-primary text-primary-foreground glow-primary-sm'
                        : 'glass-card text-white/50 hover:text-white/70'
                    }`}
                  >
                    {n}×
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(3)} className="h-12 px-4 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/50 tap-scale">
                  BACK
                </button>
                <button
                  onClick={nextStep}
                  disabled={!frequency}
                  className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl text-sm font-bold uppercase tracking-widest tap-scale glow-primary-sm flex items-center justify-center gap-2 disabled:opacity-30"
                >
                  NEXT <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}

          {/* Step 5 — Daily calorie goal */}
          {step === 5 && (
            <>
              <div>
                <h2 className="font-lexend font-bold text-lg text-white mb-1">Daily calorie goal</h2>
                <p className="text-sm text-white/40">Set a daily kcal target for nutrition tracking.</p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">DAILY KCAL</label>
                <input
                  type="number"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  min="0" step="50" autoFocus
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-lg font-mono-timer focus:outline-none focus:border-primary/60 transition-colors"
                  placeholder="e.g. 2500"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(4)} className="h-12 px-4 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/50 tap-scale">
                  BACK
                </button>
                <button
                  onClick={handleFinish}
                  disabled={!calories || loading}
                  className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl text-sm font-bold uppercase tracking-widest tap-scale glow-primary-sm disabled:opacity-30"
                >
                  {loading ? 'SAVING…' : 'GET STARTED'}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
