import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { getWorkoutTemplates, saveWorkoutTemplate, getWorkoutSessions, getExercises, getPersonalBests } from '@/lib/storage';
import type { WorkoutTemplate, Exercise, PersonalBest } from '@/lib/types';
import { Plus, ChevronRight, GripVertical, Dumbbell, Timer, Weight, Activity } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface WorkoutDashboardProps {
  userId: string;
  onSelectTemplate: (template: WorkoutTemplate) => void;
}

function SortableTemplateRow({
  t,
  sessionCount,
  onSelect,
}: {
  t: WorkoutTemplate;
  sessionCount: number;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="glass-card rounded-xl flex items-center p-4">
      <button
        {...attributes}
        {...listeners}
        className="mr-3 flex-shrink-0 text-white/20 touch-none cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>
      <button onClick={onSelect} className="flex-1 min-w-0 flex items-center justify-between text-left tap-scale">
        <div>
          <p className="font-lexend font-bold text-base text-white">{t.name}</p>
          <p className="text-xs text-white/40 mt-0.5">
            {t.exercises.length} exercise{t.exercises.length !== 1 ? 's' : ''}
            {' · '}
            {sessionCount} session{sessionCount !== 1 ? 's' : ''}
          </p>
        </div>
        <ChevronRight size={16} className="text-white/30 flex-shrink-0 ml-2" />
      </button>
    </div>
  );
}

const TRACKING_ICON: Record<string, React.ReactNode> = {
  reps_weight: <Weight size={13} />,
  bodyweight_reps: <Activity size={13} />,
  duration: <Timer size={13} />,
  distance_time: <Timer size={13} />,
};

const TRACKING_LABEL: Record<string, string> = {
  reps_weight: 'Reps + Weight',
  bodyweight_reps: 'Bodyweight',
  duration: 'Duration',
  distance_time: 'Distance + Time',
};

function formatPB(ex: Exercise, pb: PersonalBest | undefined): string {
  if (!pb) return '—';
  if (ex.trackingType === 'reps_weight') {
    const parts: string[] = [];
    if (pb.bestWeightKg != null) parts.push(`${pb.bestWeightKg} kg`);
    if (pb.bestReps != null) parts.push(`${pb.bestReps} reps`);
    return parts.join(' × ') || '—';
  }
  if (ex.trackingType === 'bodyweight_reps') {
    return pb.bestReps != null ? `${pb.bestReps} reps` : '—';
  }
  if (ex.trackingType === 'duration') {
    return pb.bestDurationS != null ? `${Math.round(pb.bestDurationS)}s` : '—';
  }
  if (ex.trackingType === 'distance_time') {
    const parts: string[] = [];
    if (pb.bestDistanceM != null) parts.push(`${pb.bestDistanceM}m`);
    if (pb.bestDurationS != null) parts.push(`${Math.round(pb.bestDurationS)}s`);
    return parts.join(' / ') || '—';
  }
  return '—';
}

export default function WorkoutDashboard({ userId, onSelectTemplate }: WorkoutDashboardProps) {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [personalBests, setPersonalBests] = useState<PersonalBest[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  useEffect(() => {
    async function load() {
      try {
        const [tmpls, sessions, exs, pbs] = await Promise.all([
          getWorkoutTemplates(userId),
          getWorkoutSessions(userId),
          getExercises(userId),
          getPersonalBests(userId),
        ]);
        setTemplates(tmpls);
        const counts: Record<string, number> = {};
        for (const s of sessions) {
          counts[s.workoutTemplateId] = (counts[s.workoutTemplateId] ?? 0) + 1;
        }
        setSessionCounts(counts);

        // Merge library exercises + exercises from templates (deduped by name, library takes priority)
        const libraryNames = new Set(exs.map((e) => e.name.toLowerCase()));
        const fromTemplates: Exercise[] = [];
        const seen = new Set(libraryNames);
        for (const t of tmpls) {
          for (const ex of t.exercises) {
            const key = ex.name.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              fromTemplates.push({
                id: ex.id,
                userId,
                name: ex.name,
                trackingType: ex.trackingType,
                defaultSets: ex.sets,
                createdAt: '',
              });
            }
          }
        }
        const merged = [...exs, ...fromTemplates].sort((a, b) => a.name.localeCompare(b.name));
        setExercises(merged);
        setPersonalBests(pbs);
      } catch {
        toast.error('Failed to load workouts');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const template: WorkoutTemplate = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      exercises: [],
    };
    try {
      await saveWorkoutTemplate(userId, template);
      setTemplates((prev) => [...prev, template]);
      setNewName('');
      setShowForm(false);
      onSelectTemplate(template);
    } catch {
      toast.error('Failed to create workout');
    } finally {
      setCreating(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setTemplates((prev) => {
      const oldIndex = prev.findIndex((t) => t.id === active.id);
      const newIndex = prev.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-white/30 text-sm uppercase tracking-widest">Loading...</span>
      </div>
    );
  }

  const pbByName = Object.fromEntries(personalBests.map((pb) => [pb.exerciseName.toLowerCase(), pb]));

  return (
    <div className="px-5 pt-5 pb-4 space-y-6">
      {/* ── My Workouts ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-lexend font-bold text-2xl text-white">My Workouts</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="h-9 px-4 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase tracking-widest tap-scale flex items-center gap-1.5 glow-primary-sm"
          >
            <Plus size={14} />
            NEW
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="mb-4 flex gap-2">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Workout name..."
              className="flex-1 h-12 bg-white/5 border border-primary/40 rounded-xl px-4 text-white text-sm focus:outline-none focus:border-primary/70"
            />
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="h-12 px-4 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase tracking-widest tap-scale disabled:opacity-50"
            >
              {creating ? '...' : 'CREATE'}
            </button>
          </form>
        )}

        {templates.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <p className="text-white/30 text-sm mb-1">No workouts yet.</p>
            <p className="text-white/20 text-xs">Tap NEW to create your first.</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={templates.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2.5">
                {templates.map((t) => (
                  <SortableTemplateRow
                    key={t.id}
                    t={t}
                    sessionCount={sessionCounts[t.id] ?? 0}
                    onSelect={() => onSelectTemplate(t)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* ── Exercise Library ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Dumbbell size={14} className="text-primary" />
          <h2 className="font-lexend font-bold text-xl text-white">Exercise Library</h2>
        </div>

        {exercises.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <p className="text-white/30 text-sm mb-1">No exercises yet.</p>
            <p className="text-white/20 text-xs">Add exercises to a workout or set a Strength Goal.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {exercises.map((ex) => {
              const pb = pbByName[ex.name.toLowerCase()];
              const pbStr = formatPB(ex, pb);
              return (
                <div key={ex.id} className="glass-card rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="flex-shrink-0 text-white/30">
                    {TRACKING_ICON[ex.trackingType]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-lexend font-bold text-sm text-white truncate">{ex.name}</p>
                    <p className="text-[10px] text-white/30 uppercase tracking-wide mt-0.5">{TRACKING_LABEL[ex.trackingType]}</p>
                  </div>
                  {pb && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-white/25 uppercase tracking-wide">Best</p>
                      <p className="text-xs font-bold text-primary/80">{pbStr}</p>
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
