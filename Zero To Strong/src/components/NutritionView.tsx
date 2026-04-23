import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { getNutritionLogs, saveNutritionLog, getGoals, upsertUserStats, unlockAchievement, getNutritionLogs as getNutritionLogsCount } from '@/lib/storage';
import type { NutritionLog, NutritionMeal, NutritionEntry, UserStats, Achievement } from '@/lib/types';
import { awardNutritionPoints, checkAchievements, ACHIEVEMENT_MAP } from '@/lib/gamification';
import { Plus, Trash2, ChevronDown, ChevronUp, Flame } from 'lucide-react';

interface NutritionViewProps {
  userId: string;
  stats: UserStats | null;
  unlockedAchievementKeys: Set<string>;
  onStatsUpdated: (stats: UserStats, newAchievements?: Achievement[]) => void;
}

const DEFAULT_MEAL_NAMES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function totalKcalFromMeals(meals: NutritionMeal[]): number {
  return meals.flatMap((m) => m.entries).reduce((sum, e) => sum + e.kcal, 0);
}

function mealKcal(meal: NutritionMeal): number {
  return meal.entries.reduce((sum, e) => sum + e.kcal, 0);
}

/** Build today's full meal list: always include 4 defaults, plus any custom meals from DB */
function buildTodayMeals(dbMeals: NutritionMeal[]): NutritionMeal[] {
  const result: NutritionMeal[] = DEFAULT_MEAL_NAMES.map((name) => {
    const existing = dbMeals.find((m) => m.name === name);
    return existing ?? { id: crypto.randomUUID(), name, entries: [] };
  });
  // Append any custom meals (not in DEFAULT_MEAL_NAMES)
  for (const m of dbMeals) {
    if (!DEFAULT_MEAL_NAMES.includes(m.name)) result.push(m);
  }
  return result;
}

// ─── Add entry form ───────────────────────────────────────────────────────────

interface AddEntryFormProps {
  onSave: (entry: NutritionEntry) => void;
  onCancel: () => void;
}

function AddEntryForm({ onSave, onCancel }: AddEntryFormProps) {
  const [desc, setDesc] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  function handleSave() {
    if (!kcal) return;
    const entry: NutritionEntry = {
      kcal: Number(kcal),
      ...(desc.trim() ? { description: desc.trim() } : {}),
      ...(protein ? { protein: Number(protein) } : {}),
      ...(carbs ? { carbs: Number(carbs) } : {}),
      ...(fat ? { fat: Number(fat) } : {}),
    };
    onSave(entry);
  }

  return (
    <div className="pt-2 space-y-2">
      <input
        autoFocus
        type="text"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Description (optional)"
        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-3 text-white text-sm focus:outline-none focus:border-primary/60 transition-colors"
      />
      <input
        type="number"
        value={kcal}
        onChange={(e) => setKcal(e.target.value)}
        placeholder="Calories (kcal) *"
        min="0"
        inputMode="numeric"
        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-3 text-white text-sm font-mono-timer focus:outline-none focus:border-primary/60 transition-colors"
      />
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Protein (g)', value: protein, set: setProtein },
          { label: 'Carbs (g)', value: carbs, set: setCarbs },
          { label: 'Fat (g)', value: fat, set: setFat },
        ].map(({ label, value, set }) => (
          <div key={label}>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1 text-center">{label}</label>
            <input
              type="number"
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder="0"
              min="0"
              inputMode="decimal"
              className="w-full h-10 bg-white/5 border border-white/10 rounded-xl px-2 text-white text-sm font-mono-timer text-center focus:outline-none focus:border-primary/60 transition-colors"
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 h-10 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/50 tap-scale"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!kcal}
          className="flex-1 h-10 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase tracking-widest tap-scale disabled:opacity-40"
        >
          ADD
        </button>
      </div>
    </div>
  );
}

// ─── Meal accordion ───────────────────────────────────────────────────────────

interface MealAccordionProps {
  meal: NutritionMeal;
  isOpen: boolean;
  onToggle: () => void;
  onAddEntry: (entry: NutritionEntry) => void;
  onDeleteEntry: (entryIndex: number) => void;
}

function MealAccordion({ meal, isOpen, onToggle, onAddEntry, onDeleteEntry }: MealAccordionProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const kcal = mealKcal(meal);

  function handleSave(entry: NutritionEntry) {
    onAddEntry(entry);
    setShowAddForm(false);
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 tap-scale text-left"
      >
        <div>
          <p className="font-lexend font-bold text-base text-white">{meal.name}</p>
          <p className="text-xs text-white/40 mt-0.5">
            {kcal > 0 ? `${kcal} kcal · ${meal.entries.length} item${meal.entries.length !== 1 ? 's' : ''}` : 'No entries'}
          </p>
        </div>
        {isOpen
          ? <ChevronUp size={16} className="text-white/30 flex-shrink-0" />
          : <ChevronDown size={16} className="text-white/30 flex-shrink-0" />}
      </button>

      {isOpen && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3 space-y-2">
          {meal.entries.map((entry, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
              <div className="flex items-start gap-2 min-w-0">
                <Flame size={12} className="text-accent flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  {entry.description && (
                    <p className="text-sm text-white/80 truncate">{entry.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    <span className="text-xs text-white/50 font-mono-timer font-bold">{entry.kcal} kcal</span>
                    {entry.protein != null && (
                      <span className="text-[10px] font-bold text-white/30 bg-white/5 rounded px-1.5 py-0.5">{entry.protein}P</span>
                    )}
                    {entry.carbs != null && (
                      <span className="text-[10px] font-bold text-white/30 bg-white/5 rounded px-1.5 py-0.5">{entry.carbs}C</span>
                    )}
                    {entry.fat != null && (
                      <span className="text-[10px] font-bold text-white/30 bg-white/5 rounded px-1.5 py-0.5">{entry.fat}F</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => onDeleteEntry(i)}
                className="h-7 w-7 flex-shrink-0 flex items-center justify-center tap-scale rounded-lg bg-destructive/10 text-destructive ml-2"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          {showAddForm ? (
            <AddEntryForm onSave={handleSave} onCancel={() => setShowAddForm(false)} />
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full h-10 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase tracking-widest tap-scale flex items-center justify-center gap-2 mt-1 glow-primary-sm"
            >
              <Plus size={13} /> ADD ENTRY
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── NutritionView ────────────────────────────────────────────────────────────

export default function NutritionView({ userId, stats, unlockedAchievementKeys, onStatsUpdated }: NutritionViewProps) {
  const [todayMeals, setTodayMeals] = useState<NutritionMeal[]>([]);
  const [pastLogs, setPastLogs] = useState<NutritionLog[]>([]);
  const [dailyGoal, setDailyGoal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // accordion open state for today's meals (by meal id) + past day entries (by date)
  const [openMeals, setOpenMeals] = useState<Set<string>>(new Set());
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());

  // add-meal form for today
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [newMealName, setNewMealName] = useState('');

  // per-past-day open meals (keyed as `${date}:${mealId}`)
  const [openPastMeals, setOpenPastMeals] = useState<Set<string>>(new Set());
  // per-past-day add forms (keyed as `${date}:${mealId}`)
  const [pastAddForms, setPastAddForms] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([getNutritionLogs(userId), getGoals(userId)])
      .then(([logs, goals]) => {
        const today = todayISO();
        const todayLog = logs.find((l) => l.date === today);
        setTodayMeals(buildTodayMeals(todayLog?.meals ?? []));
        setPastLogs(logs.filter((l) => l.date !== today));
        const nutritionGoal = goals.find((g) => g.type === 'nutrition');
        setDailyGoal(nutritionGoal?.targetValue ?? null);
      })
      .catch(() => toast.error('Failed to load nutrition'))
      .finally(() => setLoading(false));
  }, [userId]);

  // ── Today helpers ──

  async function persistToday(meals: NutritionMeal[], isNewEntry = false) {
    setTodayMeals(meals);
    try {
      await saveNutritionLog(userId, todayISO(), meals);
      // Award nutrition points once per day on first entry add
      if (isNewEntry && stats) {
        const updatedStats = awardNutritionPoints(stats);
        if (updatedStats) {
          // Check achievements
          const allLogs = await getNutritionLogsCount(userId);
          const daysWithEntries = allLogs.filter((l) => l.meals.some((m) => m.entries.length > 0)).length;
          const newKeys = checkAchievements({ totalNutritionDays: daysWithEntries }, unlockedAchievementKeys);
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
      toast.error('Failed to save');
    }
  }

  function handleTodayAddEntry(mealId: string, entry: NutritionEntry) {
    const updated = todayMeals.map((m) =>
      m.id === mealId ? { ...m, entries: [...m.entries, entry] } : m
    );
    persistToday(updated, true);
  }

  function handleTodayDeleteEntry(mealId: string, entryIndex: number) {
    const updated = todayMeals.map((m) =>
      m.id === mealId ? { ...m, entries: m.entries.filter((_, i) => i !== entryIndex) } : m
    );
    persistToday(updated);
  }

  function handleAddCustomMeal() {
    const name = newMealName.trim();
    if (!name) return;
    const newMeal: NutritionMeal = { id: crypto.randomUUID(), name, entries: [] };
    const updated = [...todayMeals, newMeal];
    setOpenMeals((prev) => new Set([...prev, newMeal.id]));
    setShowAddMeal(false);
    setNewMealName('');
    persistToday(updated);
  }

  function toggleMeal(id: string) {
    setOpenMeals((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Past day helpers ──

  async function persistPastDay(date: string, meals: NutritionMeal[]) {
    setPastLogs((prev) => prev.map((l) => l.date === date ? { ...l, meals } : l));
    try {
      await saveNutritionLog(userId, date, meals);
    } catch {
      toast.error('Failed to save');
    }
  }

  function handlePastAddEntry(date: string, mealId: string, entry: NutritionEntry) {
    const log = pastLogs.find((l) => l.date === date);
    if (!log) return;
    const updated = log.meals.map((m) =>
      m.id === mealId ? { ...m, entries: [...m.entries, entry] } : m
    );
    const key = `${date}:${mealId}`;
    setPastAddForms((prev) => { const n = new Set(prev); n.delete(key); return n; });
    persistPastDay(date, updated);
  }

  function handlePastDeleteEntry(date: string, mealId: string, entryIndex: number) {
    const log = pastLogs.find((l) => l.date === date);
    if (!log) return;
    const updated = log.meals.map((m) =>
      m.id === mealId ? { ...m, entries: m.entries.filter((_, i) => i !== entryIndex) } : m
    );
    persistPastDay(date, updated);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-white/30 text-sm uppercase tracking-widest">Loading...</span>
      </div>
    );
  }

  const todayTotal = totalKcalFromMeals(todayMeals);
  const pct = dailyGoal ? Math.min(100, Math.round((todayTotal / dailyGoal) * 100)) : null;

  return (
    <div className="px-5 pt-5 pb-4 space-y-4">

      {/* Page header */}
      <h2 className="font-lexend font-bold text-2xl text-white">Nutrition</h2>

      {/* Today's meal accordions */}
      <div>
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-lexend font-bold text-lg text-white">Today</h3>
          <span className="text-xs text-white/40 font-bold uppercase tracking-widest">
            {todayTotal}{dailyGoal ? ` / ${dailyGoal} kcal` : ' kcal'}
          </span>
        </div>
        {dailyGoal ? (
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
        ) : (
          <p className="text-xs text-white/25">Set a calorie goal in Profile to see progress.</p>
        )}
      </div>
      <div className="space-y-2.5">
        {todayMeals.map((meal) => (
          <MealAccordion
            key={meal.id}
            meal={meal}
            isOpen={openMeals.has(meal.id)}
            onToggle={() => toggleMeal(meal.id)}
            onAddEntry={(entry) => handleTodayAddEntry(meal.id, entry)}
            onDeleteEntry={(i) => handleTodayDeleteEntry(meal.id, i)}
          />
        ))}

        {/* Add custom meal */}
        {showAddMeal ? (
          <div className="glass-card rounded-2xl p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-white/30">Meal name</p>
            <input
              autoFocus
              type="text"
              value={newMealName}
              onChange={(e) => setNewMealName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomMeal()}
              placeholder="e.g. Midnight Snack"
              className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-3 text-white text-sm focus:outline-none focus:border-primary/60 transition-colors"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowAddMeal(false); setNewMealName(''); }}
                className="flex-1 h-10 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/50 tap-scale"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomMeal}
                disabled={!newMealName.trim()}
                className="flex-1 h-10 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase tracking-widest tap-scale disabled:opacity-40"
              >
                ADD MEAL
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddMeal(true)}
            className="w-full h-11 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/40 tap-scale flex items-center justify-center gap-2 hover:border-white/20 transition-colors"
          >
            <Plus size={14} /> ADD MEAL
          </button>
        )}
      </div>
      </div>

      {/* History */}
      {pastLogs.length > 0 && (
        <div>
          <h3 className="font-lexend font-bold text-lg text-white mb-3">Previous Meals</h3>
          <div className="space-y-2.5">
            {pastLogs.map((log) => {
              const total = totalKcalFromMeals(log.meals);
              const isOpen = openDays.has(log.date);
              const dayPct = dailyGoal ? Math.min(100, Math.round((total / dailyGoal) * 100)) : null;

              return (
                <div key={log.date} className="glass-card rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setOpenDays((prev) => { const n = new Set(prev); n.has(log.date) ? n.delete(log.date) : n.add(log.date); return n; })}
                    className="w-full flex items-center justify-between p-4 tap-scale text-left"
                  >
                    <div>
                      <p className="font-lexend font-bold text-base text-white">{formatDate(log.date)}</p>
                      <p className="text-xs text-white/40 mt-0.5">
                        {total} kcal{dailyGoal ? ` / ${dailyGoal} (${dayPct}%)` : ''}
                        {` · ${log.meals.reduce((n, m) => n + m.entries.length, 0)} entries`}
                      </p>
                    </div>
                    {isOpen
                      ? <ChevronUp size={16} className="text-white/30 flex-shrink-0" />
                      : <ChevronDown size={16} className="text-white/30 flex-shrink-0" />}
                  </button>

                  {isOpen && dayPct != null && (
                    <div className="mx-4 mb-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-full" style={{ width: `${dayPct}%` }} />
                    </div>
                  )}

                  {isOpen && (
                    <div className="border-t border-white/5 px-4 pb-4 pt-3 space-y-3">
                      {log.meals.map((meal) => {
                        const mKey = `${log.date}:${meal.id}`;
                        const isMealOpen = openPastMeals.has(mKey);
                        const showForm = pastAddForms.has(mKey);

                        return (
                          <div key={meal.id}>
                            <button
                              onClick={() => setOpenPastMeals((prev) => { const n = new Set(prev); n.has(mKey) ? n.delete(mKey) : n.add(mKey); return n; })}
                              className="w-full flex items-center justify-between py-1.5 tap-scale text-left"
                            >
                              <div>
                                <p className="text-sm font-bold text-white/70">{meal.name}</p>
                                <p className="text-xs text-white/30">{mealKcal(meal)} kcal · {meal.entries.length} item{meal.entries.length !== 1 ? 's' : ''}</p>
                              </div>
                              {isMealOpen
                                ? <ChevronUp size={13} className="text-white/20" />
                                : <ChevronDown size={13} className="text-white/20" />}
                            </button>

                            {isMealOpen && (
                              <div className="pl-4 space-y-1.5 mt-1">
                                {meal.entries.map((entry, i) => (
                                  <div key={i} className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
                                    <div className="flex items-start gap-2 min-w-0">
                                      <Flame size={11} className="text-accent flex-shrink-0 mt-0.5" />
                                      <div className="min-w-0">
                                        {entry.description && (
                                          <p className="text-xs text-white/70 truncate">{entry.description}</p>
                                        )}
                                        <div className="flex flex-wrap gap-1 mt-0.5">
                                          <span className="text-xs text-white/40 font-mono-timer font-bold">{entry.kcal} kcal</span>
                                          {entry.protein != null && <span className="text-[10px] font-bold text-white/25 bg-white/5 rounded px-1 py-0.5">{entry.protein}P</span>}
                                          {entry.carbs != null && <span className="text-[10px] font-bold text-white/25 bg-white/5 rounded px-1 py-0.5">{entry.carbs}C</span>}
                                          {entry.fat != null && <span className="text-[10px] font-bold text-white/25 bg-white/5 rounded px-1 py-0.5">{entry.fat}F</span>}
                                        </div>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handlePastDeleteEntry(log.date, meal.id, i)}
                                      className="h-7 w-7 flex-shrink-0 flex items-center justify-center tap-scale rounded-lg bg-destructive/10 text-destructive ml-2"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                ))}

                                {showForm ? (
                                  <AddEntryForm
                                    onSave={(entry) => handlePastAddEntry(log.date, meal.id, entry)}
                                    onCancel={() => setPastAddForms((prev) => { const n = new Set(prev); n.delete(mKey); return n; })}
                                  />
                                ) : (
                                  <button
                                    onClick={() => setPastAddForms((prev) => new Set([...prev, mKey]))}
                                    className="w-full h-9 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/30 tap-scale flex items-center justify-center gap-1.5 hover:border-white/20 transition-colors"
                                  >
                                    <Plus size={12} /> ADD ENTRY
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
