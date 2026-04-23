import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { getWorkoutSessions } from '@/lib/storage';
import type { WorkoutSession, DurationSetLog, RepsWeightSetLog, DistanceTimeSetLog } from '@/lib/types';
import { ArrowLeft, ChevronDown, ChevronUp, Dumbbell } from 'lucide-react';

interface HistoryViewProps {
  userId: string;
  onBack: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function formatSetLog(trackingType: string, set: DurationSetLog | RepsWeightSetLog | DistanceTimeSetLog): string {
  if (trackingType === 'duration') {
    return `${(set as DurationSetLog).time}s`;
  } else if (trackingType === 'reps_weight') {
    const d = set as RepsWeightSetLog;
    return `${d.reps} × ${d.weight}kg`;
  } else if (trackingType === 'bodyweight_reps') {
    return `${(set as { reps: number }).reps} reps`;
  } else {
    const d = set as DistanceTimeSetLog;
    return `${d.distance}m · ${d.time}s`;
  }
}

export default function HistoryView({ userId, onBack }: HistoryViewProps) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWorkoutSessions(userId)
      .then((data) => setSessions([...data].reverse()))
      .catch(() => toast.error('Failed to load history'))
      .finally(() => setLoading(false));
  }, [userId]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="px-5 pt-5 pb-4">
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="h-9 w-9 flex items-center justify-center glass-card rounded-xl tap-scale text-white/60"
        >
          <ArrowLeft size={16} />
        </button>
        <h2 className="font-lexend font-bold text-2xl text-white">History</h2>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="text-white/30 text-sm uppercase tracking-widest">Loading...</span>
        </div>
      ) : sessions.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <Dumbbell size={32} className="text-white/10 mx-auto mb-3" />
          <p className="text-white/30 text-sm">No sessions yet.</p>
          <p className="text-white/20 text-xs mt-1">Complete a workout to see it here.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sessions.map((session) => {
            const isOpen = expanded.has(session.id);
            return (
              <div key={session.id} className="glass-card rounded-2xl overflow-hidden">
                <button
                  onClick={() => toggleExpand(session.id)}
                  className="w-full flex items-center justify-between p-4 tap-scale text-left"
                >
                  <div>
                    <p className="font-lexend font-bold text-base text-white">{session.workoutName}</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {formatDate(session.date)}
                      {session.durationSeconds ? ` · ${formatDuration(session.durationSeconds)}` : ''}
                      {` · ${session.exercises.length} exercise${session.exercises.length !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  {isOpen
                    ? <ChevronUp size={16} className="text-white/30 flex-shrink-0" />
                    : <ChevronDown size={16} className="text-white/30 flex-shrink-0" />}
                </button>

                {isOpen && (
                  <div className="border-t border-white/5 px-4 pb-4 pt-3 space-y-4">
                    {session.exercises.map((ex) => (
                      <div key={ex.exerciseId}>
                        <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-2">
                          {ex.exerciseName}
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                          {ex.sets.map((set, i) => (
                            <span key={i} className="text-xs font-mono-timer text-white/60 bg-white/5 rounded-lg px-2 py-1">
                              S{i + 1} {formatSetLog(ex.trackingType, set as DurationSetLog | RepsWeightSetLog | DistanceTimeSetLog)}
                            </span>
                          ))}
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
  );
}
