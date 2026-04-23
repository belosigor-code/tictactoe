import { useState } from 'react';
import { toast } from 'sonner';
import { saveWorkoutTemplate, deleteWorkoutTemplate } from '@/lib/storage';
import type { WorkoutTemplate, ExerciseTemplate } from '@/lib/types';
import AddExerciseForm from './AddExerciseForm';
import { ArrowLeft, Pencil, Trash2, Plus, Play, GripVertical } from 'lucide-react';
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

interface WorkoutDetailProps {
  userId: string;
  template: WorkoutTemplate;
  onBack: () => void;
  onStartWorkout: (template: WorkoutTemplate) => void;
  onTemplateUpdated: (template: WorkoutTemplate) => void;
}

const TRACKING_LABEL: Record<string, string> = {
  duration: 'Time',
  reps_weight: 'Reps + Weight',
  distance_time: 'Distance + Time',
  bodyweight_reps: 'Bodyweight',
};

// ─── Sortable exercise row ────────────────────────────────────────────────────

interface SortableExerciseRowProps {
  ex: ExerciseTemplate;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableExerciseRow({ ex, onEdit, onDelete }: SortableExerciseRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ex.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="glass-card rounded-xl flex items-center p-4">
      {/* Grip handle */}
      <button
        {...attributes}
        {...listeners}
        className="mr-3 flex-shrink-0 text-white/20 touch-none cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>

      <button onClick={onEdit} className="flex-1 min-w-0 text-left tap-scale">
        <p className="font-lexend font-bold text-base text-white truncate">{ex.name}</p>
        <p className="text-xs text-white/40 mt-0.5">
          {ex.sets} sets · {TRACKING_LABEL[ex.trackingType]}
        </p>
      </button>

      <div className="flex gap-2 flex-shrink-0 ml-2">
        <button
          onClick={onEdit}
          className="h-9 w-9 flex items-center justify-center glass-card rounded-xl tap-scale text-white/50"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          className="h-9 w-9 flex items-center justify-center rounded-xl tap-scale bg-destructive/10 border border-destructive/30 text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── WorkoutDetail ────────────────────────────────────────────────────────────

export default function WorkoutDetail({
  userId,
  template,
  onBack,
  onStartWorkout,
  onTemplateUpdated,
}: WorkoutDetailProps) {
  const [current, setCurrent] = useState<WorkoutTemplate>(template);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingExercise, setEditingExercise] = useState<ExerciseTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  async function persistTemplate(updated: WorkoutTemplate) {
    setSaving(true);
    try {
      await saveWorkoutTemplate(userId, updated);
      setCurrent(updated);
      onTemplateUpdated(updated);
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddExercise(exercise: ExerciseTemplate) {
    const updated = { ...current, exercises: [...current.exercises, exercise] };
    await persistTemplate(updated);
    setShowAddForm(false);
  }

  async function handleEditExercise(exercise: ExerciseTemplate) {
    const updated = {
      ...current,
      exercises: current.exercises.map((ex) => (ex.id === exercise.id ? exercise : ex)),
    };
    await persistTemplate(updated);
    setEditingExercise(null);
  }

  async function handleDeleteExercise(exerciseId: string) {
    const updated = {
      ...current,
      exercises: current.exercises.filter((ex) => ex.id !== exerciseId),
    };
    await persistTemplate(updated);
  }

  async function handleDeleteTemplate() {
    try {
      await deleteWorkoutTemplate(userId, current.id);
      onBack();
    } catch {
      toast.error('Failed to delete workout');
    }
  }

  async function handleModeChange(mode: 'linear' | 'circular') {
    if (current.mode === mode) return;
    await persistTemplate({ ...current, mode });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = current.exercises.findIndex((ex) => ex.id === active.id);
    const newIndex = current.exercises.findIndex((ex) => ex.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(current.exercises, oldIndex, newIndex);
    persistTemplate({ ...current, exercises: reordered });
  }

  const mode = current.mode ?? 'linear';

  return (
    <div className="px-5 pt-5 pb-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="h-9 w-9 flex items-center justify-center glass-card rounded-xl tap-scale text-white/60"
        >
          <ArrowLeft size={16} />
        </button>
        <h2 className="font-lexend font-bold text-xl text-white flex-1">{current.name}</h2>
        {saving && (
          <span className="text-xs text-white/30 uppercase tracking-widest">Saving...</span>
        )}
        <button
          onClick={() => setConfirmDelete(true)}
          className="h-9 w-9 flex items-center justify-center rounded-xl tap-scale bg-destructive/10 border border-destructive/30 text-destructive"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Mode toggle */}
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-2">Workout Mode</p>
        <div className="flex glass-card rounded-xl p-1">
          <button
            onClick={() => handleModeChange('linear')}
            className={`flex-1 h-9 text-xs font-bold uppercase tracking-widest rounded-lg tap-scale transition-all ${
              mode === 'linear'
                ? 'bg-primary text-primary-foreground glow-primary-sm'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Linear
          </button>
          <button
            onClick={() => handleModeChange('circular')}
            className={`flex-1 h-9 text-xs font-bold uppercase tracking-widest rounded-lg tap-scale transition-all ${
              mode === 'circular'
                ? 'bg-primary text-primary-foreground glow-primary-sm'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Circular
          </button>
        </div>
        <p className="text-[10px] text-white/25 mt-1.5 px-1">
          {mode === 'linear'
            ? 'All sets of each exercise before moving on.'
            : 'One set per exercise, rotating through all exercises each round.'}
        </p>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mb-4 glass-card rounded-xl p-4 border border-destructive/30">
          <p className="text-sm text-white mb-3">Delete "{current.name}"? This cannot be undone.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 h-10 glass-card rounded-xl text-xs font-bold uppercase tracking-widest text-white/50 tap-scale"
            >
              CANCEL
            </button>
            <button
              onClick={handleDeleteTemplate}
              className="flex-1 h-10 bg-destructive/20 border border-destructive/40 text-destructive rounded-xl text-xs font-bold uppercase tracking-widest tap-scale"
            >
              DELETE
            </button>
          </div>
        </div>
      )}

      {/* Exercise list with drag-and-drop */}
      {current.exercises.length === 0 && !showAddForm && (
        <div className="glass-card rounded-2xl p-10 text-center mb-4">
          <p className="text-white/30 text-sm">No exercises yet.</p>
          <p className="text-white/20 text-xs mt-1">Tap ADD EXERCISE to get started.</p>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={current.exercises.map((ex) => ex.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2.5 mb-4">
            {current.exercises.map((ex) => (
              <div key={ex.id}>
                {editingExercise?.id === ex.id ? (
                  <AddExerciseForm
                    userId={userId}
                    initial={ex}
                    onSave={handleEditExercise}
                    onCancel={() => setEditingExercise(null)}
                  />
                ) : (
                  <SortableExerciseRow
                    ex={ex}
                    onEdit={() => setEditingExercise(ex)}
                    onDelete={() => handleDeleteExercise(ex.id)}
                  />
                )}
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add exercise form */}
      {showAddForm && (
        <div className="mb-4">
          <AddExerciseForm
            userId={userId}
            onSave={handleAddExercise}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {!showAddForm && !editingExercise && (
        <button
          onClick={() => setShowAddForm(true)}
          className={`w-full h-12 rounded-xl text-sm font-bold uppercase tracking-widest tap-scale flex items-center justify-center gap-2 mb-3 transition-colors ${current.exercises.length === 0 ? 'bg-primary text-primary-foreground glow-primary-sm' : 'glass-card text-white/50 hover:border-white/20'}`}
        >
          <Plus size={16} />
          ADD EXERCISE
        </button>
      )}

      {/* Start workout */}
      {current.exercises.length > 0 && !showAddForm && !editingExercise && (
        <button
          onClick={() => onStartWorkout(current)}
          className="w-full h-14 bg-primary text-primary-foreground rounded-xl text-sm font-bold uppercase tracking-widest tap-scale glow-primary flex items-center justify-center gap-2"
        >
          <Play size={18} fill="currentColor" />
          START WORKOUT
        </button>
      )}
    </div>
  );
}
