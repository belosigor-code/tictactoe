import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUser, logoutUser, getUserStats, upsertUserStats, getAchievements, unlockAchievement } from '@/lib/storage';
import type { UserProfile, WorkoutTemplate, UserStats, Achievement } from '@/lib/types';
import { processActivity, ACHIEVEMENT_MAP, getStreakDef } from '@/lib/gamification';
import LoginScreen from '@/components/LoginScreen';
import HomeView from '@/components/HomeView';
import WorkoutDashboard from '@/components/WorkoutDashboard';
import WorkoutDetail from '@/components/WorkoutDetail';
import WorkoutView from '@/components/WorkoutView';
import NutritionView from '@/components/NutritionView';
import ProgressView from '@/components/ProgressView';
import ProfileView from '@/components/ProfileView';
import OnboardingView from '@/components/OnboardingView';
import AchievementCelebration from '@/components/AchievementCelebration';
import { Home, Dumbbell, Utensils, TrendingUp, User, Pause, Play, Square } from 'lucide-react';


type Tab = 'home' | 'workouts' | 'nutrition' | 'progress' | 'profile';
type Screen = 'dashboard' | 'detail' | 'active';

const NAV_KEY = 'zts-navigation-state';

interface NavState {
  tab: Tab;
  screen: Screen;
}

function loadNavState(): NavState {
  try {
    const raw = sessionStorage.getItem(NAV_KEY);
    if (raw) return JSON.parse(raw) as NavState;
  } catch { /* ignore */ }
  return { tab: 'home', screen: 'dashboard' };
}

function saveNavState(state: NavState) {
  sessionStorage.setItem(NAV_KEY, JSON.stringify(state));
}

interface WorkoutTimerState {
  startTime: number;
  elapsedBeforePause: number;
  paused: boolean;
}

export default function Index() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [celebrationQueue, setCelebrationQueue] = useState<Achievement[]>([]);
  const [profileScrollTarget, setProfileScrollTarget] = useState<'schedule' | 'goals' | 'stats' | null>(null);
  const [progressScrollTarget, setProgressScrollTarget] = useState<'history' | 'pbs' | null>(null);
  const [tab, setTab] = useState<Tab>(() => loadNavState().tab);
  const [screen, setScreen] = useState<Screen>(() => loadNavState().screen);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkoutTemplate | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<WorkoutTemplate | null>(null);
  const [timerState, setTimerState] = useState<WorkoutTimerState | null>(null);
  const [timerDisplay, setTimerDisplay] = useState('0:00');

  useEffect(() => {
    let resolved = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (resolved) return;
      if (session?.user) {
        resolved = true;
        getCurrentUser().then((profile) => { setUser(profile); setAuthLoading(false); });
      } else {
        resolved = true;
        setUser(null);
        setAuthLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (resolved) return;
      if (session?.user) {
        resolved = true;
        getCurrentUser().then((profile) => { setUser(profile); setAuthLoading(false); });
      } else {
        resolved = true;
        setUser(null);
        setAuthLoading(false);
      }
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  // Load stats + process daily activity whenever user is set
  useEffect(() => {
    if (!user) { setStats(null); setAchievements([]); return; }
    Promise.all([
      getUserStats(user.userId),
      getAchievements(user.userId),
    ]).then(async ([existingStats, existingAchievements]) => {
      const base: UserStats = existingStats ?? {
        userId: user.userId,
        totalPoints: 0,
        streakDays: 0,
        longestStreak: 0,
        lastActiveDate: null,
        lastWeightPointsWeek: null,
        lastNutritionPointsDate: null,
        fastestWorkoutS: null,
      };
      const unlockedKeys = new Set(existingAchievements.map((a) => a.achievementKey));
      const { updatedStats, newAchievementKeys } = processActivity(base, unlockedKeys);

      let finalStats = updatedStats;
      const newUnlocked: Achievement[] = [...existingAchievements];

      const justUnlocked: Achievement[] = [];
      if (newAchievementKeys.length > 0) {
        for (const key of newAchievementKeys) {
          const def = ACHIEVEMENT_MAP[key] ?? getStreakDef(updatedStats.streakDays);
          const a = await unlockAchievement(user.userId, key, def.bonusPoints);
          if (a) {
            newUnlocked.push(a);
            justUnlocked.push(a);
          }
        }
      }
      if (justUnlocked.length > 0) setCelebrationQueue(justUnlocked);

      await upsertUserStats(finalStats);
      setStats(finalStats);
      setAchievements(newUnlocked);
    }).catch(() => { /* non-critical */ });
  }, [user?.userId]);

  useEffect(() => {
    saveNavState({ tab, screen });
  }, [tab, screen]);

  useEffect(() => {
    function handlePop() {
      if (screen !== 'dashboard') {
        setScreen('dashboard');
        window.history.pushState(null, '', '/');
      }
    }
    window.history.pushState(null, '', '/');
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [screen]);

  useEffect(() => {
    if (!timerState || timerState.paused) return;
    const id = setInterval(() => {
      const elapsed = timerState.elapsedBeforePause + (Date.now() - timerState.startTime) / 1000;
      setTimerDisplay(formatDuration(elapsed));
    }, 500);
    return () => clearInterval(id);
  }, [timerState]);

  function formatDuration(seconds: number): string {
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function startTimer() {
    setTimerState({ startTime: Date.now(), elapsedBeforePause: 0, paused: false });
    setTimerDisplay('0:00');
  }

  const pauseTimer = useCallback(() => {
    setTimerState((prev) => {
      if (!prev || prev.paused) return prev;
      const elapsed = prev.elapsedBeforePause + (Date.now() - prev.startTime) / 1000;
      return { ...prev, paused: true, elapsedBeforePause: elapsed };
    });
  }, []);

  const resumeTimer = useCallback(() => {
    setTimerState((prev) => {
      if (!prev || !prev.paused) return prev;
      return { ...prev, paused: false, startTime: Date.now() };
    });
  }, []);

  function stopTimer() {
    setTimerState(null);
    setTimerDisplay('0:00');
  }

  function getElapsedSeconds(): number {
    if (!timerState) return 0;
    if (timerState.paused) return timerState.elapsedBeforePause;
    return timerState.elapsedBeforePause + (Date.now() - timerState.startTime) / 1000;
  }

  function handleLogout() {
    logoutUser();
    sessionStorage.removeItem(NAV_KEY);
    setUser(null);
    setTab('home');
    setScreen('dashboard');
    setActiveTemplate(null);
    setTimerState(null);
  }

  function navigateToTab(newTab: Tab) {
    setTab(newTab);
    if (newTab !== 'workouts') setScreen('dashboard');
  }

  function handleSelectTemplate(template: WorkoutTemplate) {
    setSelectedTemplate(template);
    setScreen('detail');
  }

  function handleStartWorkout(template: WorkoutTemplate) {
    setActiveTemplate(template);
    setTab('workouts');
    setScreen('active');
    startTimer();
  }

  function handleWorkoutFinished() {
    setActiveTemplate(null);
    stopTimer();
    setTab('home');
    setScreen('dashboard');
  }

  function handleWorkoutAborted() {
    setActiveTemplate(null);
    stopTimer();
    setTab('workouts');
    setScreen('dashboard');
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="font-lexend font-bold text-primary text-glow-primary">DAY 1</span>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={() => { getCurrentUser().then(setUser); }} />;
  }

  if (!user.onboardingCompleted) {
    return (
      <OnboardingView
        user={user}
        onComplete={(updatedStats) => {
          setUser({ ...user, onboardingCompleted: true });
          setStats(updatedStats);
          setCelebrationQueue([{
            id: 'onboarding',
            userId: user.userId,
            achievementKey: 'onboarding_complete',
            unlockedAt: new Date().toISOString(),
            bonusPoints: 100,
          }]);
        }}
      />
    );
  }

  const isWorkoutActive = screen === 'active' && activeTemplate !== null;

  const TABS = [
    { id: 'home' as Tab, label: 'Home', Icon: Home },
    { id: 'workouts' as Tab, label: 'Train', Icon: Dumbbell },
    { id: 'nutrition' as Tab, label: 'Fuel', Icon: Utensils },
    { id: 'progress' as Tab, label: 'Progress', Icon: TrendingUp },
    { id: 'profile' as Tab, label: 'Profile', Icon: User },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Fixed header */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-5 h-14 glass-nav border-b">
        <span className="font-lexend font-black text-lg italic text-primary tracking-widest uppercase text-glow-primary">
          DAY 1
        </span>
        <span className="text-xs font-bold uppercase tracking-widest text-white/50">
          {user.username}
        </span>
      </header>

      {/* Scrollable content */}
      <main className={`flex-1 overflow-y-auto mx-auto w-full max-w-lg pt-14 ${isWorkoutActive ? 'pb-44' : 'pb-24'}`}>
        {tab === 'home' && (
          <HomeView
            userId={user.userId}
            username={user.username}
            stats={stats}
            onStartWorkout={handleStartWorkout}
            onEditSchedule={() => { setProfileScrollTarget('schedule'); navigateToTab('profile'); }}
            onCreateWorkout={() => navigateToTab('workouts')}
            onNavigateToNutrition={() => navigateToTab('nutrition')}
            onNavigateToProgress={(section) => { setProgressScrollTarget(section ?? null); navigateToTab('progress'); }}
            onNavigateToProfile={(section) => { setProfileScrollTarget(section ?? null); navigateToTab('profile'); }}
          />
        )}
        {tab === 'workouts' && screen === 'dashboard' && (
          <WorkoutDashboard userId={user.userId} onSelectTemplate={handleSelectTemplate} />
        )}
        {tab === 'workouts' && screen === 'detail' && selectedTemplate && (
          <WorkoutDetail
            userId={user.userId}
            template={selectedTemplate}
            onBack={() => setScreen('dashboard')}
            onStartWorkout={handleStartWorkout}
            onTemplateUpdated={setSelectedTemplate}
          />
        )}
        {tab === 'workouts' && screen === 'active' && activeTemplate && (
          <WorkoutView
            userId={user.userId}
            template={activeTemplate}
            timerPaused={timerState?.paused ?? false}
            onFinish={handleWorkoutFinished}
            onAbort={handleWorkoutAborted}
            getElapsedSeconds={getElapsedSeconds}
            stats={stats}
            unlockedAchievementKeys={new Set(achievements.map((a) => a.achievementKey))}
            onStatsUpdated={(s, newAchievements) => {
              setStats(s);
              setAchievements((prev) => [...prev, ...newAchievements]);
              if (newAchievements.length > 0) setCelebrationQueue(newAchievements);
            }}
          />
        )}
        {tab === 'nutrition' && (
          <NutritionView
            userId={user.userId}
            stats={stats}
            unlockedAchievementKeys={new Set(achievements.map((a) => a.achievementKey))}
            onStatsUpdated={(s, newAchievements) => {
              setStats(s);
              if (newAchievements && newAchievements.length > 0) setCelebrationQueue(newAchievements);
            }}
          />
        )}
        {tab === 'progress' && (
          <ProgressView
            userId={user.userId}
            stats={stats}
            unlockedAchievementKeys={new Set(achievements.map((a) => a.achievementKey))}
            scrollToSection={progressScrollTarget}
            onScrollHandled={() => setProgressScrollTarget(null)}
            onStatsUpdated={(s, newAchievements) => {
              setStats(s);
              if (newAchievements && newAchievements.length > 0) setCelebrationQueue(newAchievements);
            }}
          />
        )}
        {tab === 'profile' && (
          <ProfileView
            userId={user.userId}
            username={user.username}
            stats={stats}
            achievements={achievements}
            onLogout={handleLogout}
            scrollTarget={profileScrollTarget}
            onScrollHandled={() => setProfileScrollTarget(null)}
          />
        )}
      </main>

      {/* Workout control bar */}
      {isWorkoutActive && (
        <div className="fixed bottom-20 left-0 right-0 z-20 glass-nav border-t">
          <div className="max-w-lg mx-auto flex items-center justify-between px-5 h-14">
            <div className="flex items-center gap-2">
              <span className="font-mono-timer text-xl font-bold text-primary text-glow-primary">{timerDisplay}</span>
              {timerState?.paused && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 bg-white/10 rounded-full px-2 py-0.5">PAUSED</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={timerState?.paused ? resumeTimer : pauseTimer}
                className="h-10 w-10 flex items-center justify-center glass-card rounded-xl tap-scale text-white/80"
              >
                {timerState?.paused ? <Play size={16} /> : <Pause size={16} />}
              </button>
              <button
                onClick={() => document.dispatchEvent(new CustomEvent('zts:stop-workout'))}
                className="h-10 w-10 flex items-center justify-center rounded-xl tap-scale bg-destructive/20 border border-destructive/40 text-destructive"
              >
                <Square size={16} fill="currentColor" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-10 glass-nav border-t rounded-t-2xl">
        <div className="max-w-lg mx-auto flex h-20 pb-safe">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => navigateToTab(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 tap-scale transition-colors ${
                tab === id ? 'text-primary text-glow-primary' : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Icon size={20} strokeWidth={tab === id ? 2.5 : 1.8} />
              <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Achievement celebration overlay */}
      {celebrationQueue.length > 0 && (
        <AchievementCelebration
          queue={celebrationQueue}
          onAllCollected={() => setCelebrationQueue([])}
        />
      )}
    </div>
  );
}
