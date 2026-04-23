import { useState, useEffect } from 'react';
import { getWorkoutTemplates } from '@/lib/storage';
import type { ExerciseTemplate, TrackingType } from '@/lib/types';
import { Plus, Minus } from 'lucide-react';
import ExerciseCatalogInput from './ExerciseCatalogInput';

interface AddExerciseFormProps {
  userId: string;
  initial?: ExerciseTemplate;
  onSave: (exercise: ExerciseTemplate) => void;
  onCancel: () => void;
}

const TRACKING_OPTIONS: { value: TrackingType; label: string }[] = [
  { value: 'reps_weight', label: 'Reps + Weight' },
  { value: 'bodyweight_reps', label: 'Bodyweight' },
  { value: 'duration', label: 'Duration' },
  { value: 'distance_time', label: 'Dist + Time' },
];

export default function AddExerciseForm({ userId, initial, onSave, onCancel }: AddExerciseFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [sets, setSets] = useState(initial?.sets ?? 3);
  const [trackingType, setTrackingType] = useState<TrackingType>(initial?.trackingType ?? 'reps_weight');
  const [userExercises, setUserExercises] = useState<ExerciseTemplate[]>([]);

  useEffect(() => {
    getWorkoutTemplates(userId).then((templates) => {
      const seen = new Set<string>();
      const all: ExerciseTemplate[] = [];
      for (const t of templates) {
        for (const ex of t.exercises) {
          const key = ex.name.toLowerCase();
          if (!seen.has(key)) { seen.add(key); all.push(ex); }
        }
      }
      setUserExercises(all);
    });
  }, [userId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      sets,
      trackingType,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-5 border border-primary/30">
      <h3 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4">
        {initial ? 'EDIT EXERCISE' : 'ADD EXERCISE'}
      </h3>

      {/* Name with catalog autocomplete */}
      <div className="mb-4">
        <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">NAME</label>
        <ExerciseCatalogInput
          value={name}
          onChange={setName}
          onSelect={(entry) => {
            setName(entry.name);
            setTrackingType(entry.trackingType);
            setSets(entry.defaultSets);
          }}
          userExercises={userExercises}
          autoFocus={!initial}
        />
      </div>

      {/* Sets */}
      <div className="mb-4">
        <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">SETS</label>
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Decrease sets"
            onClick={() => setSets((s) => Math.max(1, s - 1))}
            className="h-10 w-10 glass-card rounded-xl flex items-center justify-center tap-scale text-white/70"
          >
            <Minus size={14} />
          </button>
          <span className="font-mono-timer text-2xl font-bold w-8 text-center text-white">{sets}</span>
          <button
            type="button"
            aria-label="Increase sets"
            onClick={() => setSets((s) => Math.min(10, s + 1))}
            className="h-10 w-10 glass-card rounded-xl flex items-center justify-center tap-scale text-white/70"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Tracking type */}
      <div className="mb-5">
        <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">TRACKING</label>
        <div className="grid grid-cols-2 gap-2">
          {TRACKING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTrackingType(opt.value)}
              className={`h-10 text-xs font-bold uppercase tracking-wide rounded-xl tap-scale transition-all ${
                trackingType === opt.value
                  ? 'bg-primary text-primary-foreground glow-primary-sm'
                  : 'glass-card text-white/50 hover:text-white/70'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-12 glass-card rounded-xl text-sm font-bold uppercase tracking-widest text-white/50 tap-scale"
        >
          CANCEL
        </button>
        <button
          type="submit"
          disabled={!name.trim()}
          className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl text-sm font-bold uppercase tracking-widest tap-scale glow-primary-sm disabled:opacity-50"
        >
          {initial ? 'SAVE' : 'ADD'}
        </button>
      </div>
    </form>
  );
}
