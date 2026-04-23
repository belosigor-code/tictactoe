import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import type { Achievement } from '@/lib/types';
import { ACHIEVEMENT_MAP, getStreakDef } from '@/lib/gamification';

interface AchievementCelebrationProps {
  queue: Achievement[];
  onAllCollected: () => void;
}

export default function AchievementCelebration({ queue, onAllCollected }: AchievementCelebrationProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const fired = useRef(false);

  const current = queue[currentIdx];
  const def = current ? (ACHIEVEMENT_MAP[current.achievementKey] ?? getStreakDef(parseInt(current.achievementKey.replace('streak_', '') || '0', 10))) : null;

  function fireConfetti() {
    const count = 180;
    const defaults = { startVelocity: 30, spread: 360, ticks: 80, zIndex: 200 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    confetti({ ...defaults, particleCount: count * 0.25, origin: { x: randomInRange(0.1, 0.3), y: 0.5 }, colors: ['#ccff00', '#ffffff', '#a0ff00'] });
    confetti({ ...defaults, particleCount: count * 0.25, origin: { x: randomInRange(0.7, 0.9), y: 0.5 }, colors: ['#ccff00', '#ffffff', '#ffdd00'] });
    setTimeout(() => {
      confetti({ ...defaults, particleCount: count * 0.3, origin: { x: 0.5, y: 0.3 }, colors: ['#ccff00', '#ffffff', '#00ffaa'] });
    }, 150);
  }

  useEffect(() => {
    if (!fired.current) {
      fired.current = true;
      fireConfetti();
    }
  }, []);

  useEffect(() => {
    setAnimKey((k) => k + 1);
    fireConfetti();
  }, [currentIdx]);

  if (!current || !def) return null;

  const isLast = currentIdx === queue.length - 1;

  function handleCollect() {
    if (isLast) {
      onAllCollected();
    } else {
      fired.current = true;
      setCurrentIdx((i) => i + 1);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: '#0a0a0a', backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% 20%, rgba(204,255,0,0.15) 0%, transparent 70%)' }}
    >
      {/* Step indicator */}
      {queue.length > 1 && (
        <div className="absolute top-6 right-6 text-xs font-bold text-white/30 uppercase tracking-widest">
          {currentIdx + 1} / {queue.length}
        </div>
      )}

      {/* Animated content */}
      <div key={animKey} className="flex flex-col items-center gap-6" style={{ animation: 'celebrationFadeUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}>

        {/* Icon */}
        <div className="text-7xl" style={{ animation: 'celebrationBounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both', display: 'inline-block' }}>
          {def.icon}
        </div>

        {/* Achievement label */}
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Achievement Unlocked</p>
          <h2 className="font-lexend font-black text-3xl text-white">{def.label}</h2>
          <p className="text-white/50 text-sm">{def.description}</p>
        </div>

        {/* Points number */}
        <div
          className="flex flex-col items-center gap-1"
          style={{ animation: 'celebrationScale 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both' }}
        >
          <span
            className="font-lexend font-black text-primary text-glow-primary"
            style={{ fontSize: 'clamp(4rem, 20vw, 6rem)', lineHeight: 1 }}
          >
            +{def.bonusPoints.toLocaleString()}
          </span>
          <span className="text-sm font-bold uppercase tracking-widest text-white/40">points</span>
        </div>

        {/* Collect button */}
        <button
          onClick={handleCollect}
          className="mt-4 h-14 px-10 bg-primary text-primary-foreground rounded-2xl text-sm font-bold uppercase tracking-widest tap-scale glow-primary"
          style={{ animation: 'celebrationFadeUp 0.4s ease 0.4s both' }}
        >
          {isLast ? 'Collect Points' : `Collect & Next →`}
        </button>
      </div>

      <style>{`
        @keyframes celebrationFadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes celebrationBounce {
          from { opacity: 0; transform: scale(0.3) rotate(-10deg); }
          to   { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes celebrationScale {
          from { opacity: 0; transform: scale(0.5); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
