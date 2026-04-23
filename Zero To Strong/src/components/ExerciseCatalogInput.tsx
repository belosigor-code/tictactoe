import { useState } from 'react';
import { searchCatalog } from '@/lib/exerciseCatalog';
import type { CatalogEntry } from '@/lib/exerciseCatalog';
import type { TrackingType } from '@/lib/types';

interface UserExerciseHint {
  name: string;
  trackingType?: TrackingType;
  defaultSets?: number;
}

interface ExerciseCatalogInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when user picks a specific entry; includes full defaults for auto-fill */
  onSelect?: (entry: CatalogEntry) => void;
  /** User's own exercises shown above catalog results */
  userExercises?: UserExerciseHint[];
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  Calisthenics:      'text-primary/70',
  'Weighted Training': 'text-blue-400/70',
  Cardio:            'text-orange-400/70',
  Stretching:        'text-green-400/70',
  Yoga:              'text-purple-400/70',
};

export default function ExerciseCatalogInput({
  value,
  onChange,
  onSelect,
  userExercises = [],
  placeholder = 'e.g. Bench Press',
  autoFocus = false,
  className = '',
}: ExerciseCatalogInputProps) {
  const [open, setOpen] = useState(false);

  // User exercises that match query (shown first)
  const userMatches: CatalogEntry[] = value.trim()
    ? userExercises
        .filter((ex) => ex.name.toLowerCase().includes(value.toLowerCase()) && ex.name.toLowerCase() !== value.toLowerCase())
        .map((ex) => ({
          name: ex.name,
          trackingType: ex.trackingType ?? 'reps_weight',
          defaultSets: ex.defaultSets ?? 3,
          category: 'Weighted Training' as const,   // placeholder category for user entries
        }))
    : [];

  // Catalog entries that match but aren't already in user matches
  const userNames = new Set(userMatches.map((e) => e.name.toLowerCase()));
  const catalogMatches = searchCatalog(value).filter(
    (e) => !userNames.has(e.name.toLowerCase()) && e.name.toLowerCase() !== value.toLowerCase()
  );

  const allMatches = [...userMatches, ...catalogMatches].slice(0, 8);
  const showDropdown = open && allMatches.length > 0;

  function handleSelect(entry: CatalogEntry) {
    onChange(entry.name);
    onSelect?.(entry);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-sm focus:outline-none focus:border-primary/60 transition-colors ${className}`}
      />

      {showDropdown && (
        <div className="absolute z-50 top-[calc(100%+4px)] left-0 right-0 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
          {allMatches.map((entry, i) => {
            const isUserEntry = i < userMatches.length;
            return (
              <button
                key={`${entry.name}-${i}`}
                type="button"
                onMouseDown={() => handleSelect(entry)}
                className="w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isUserEntry && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-primary/50 flex-shrink-0">Mine</span>
                  )}
                  <span className="text-sm text-white truncate">{entry.name}</span>
                </div>
                {!isUserEntry && (
                  <span className={`text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ml-2 ${CATEGORY_COLOR[entry.category] ?? 'text-white/30'}`}>
                    {entry.category}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
