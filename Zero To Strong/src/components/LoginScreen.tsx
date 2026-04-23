import { useState } from 'react';
import { toast } from 'sonner';
import { registerUser, loginUser } from '@/lib/storage';

interface LoginScreenProps {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          return;
        }
        const { sessionCreated } = await registerUser(email, username, password);
        if (sessionCreated) {
          onLogin();
        } else {
          setSignupSuccess(true);
        }
      } else {
        await loginUser(email, password);
        onLogin();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="glass-card rounded-2xl p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✉️</span>
            </div>
            <h1 className="font-lexend font-bold text-2xl text-white mb-3">Check your email</h1>
            <p className="text-white/50 text-sm mb-6 leading-relaxed">
              We sent a confirmation link to <span className="text-white font-medium">{email}</span>.
              Confirm your account, then log in.
            </p>
            <button
              onClick={() => { setMode('login'); setSignupSuccess(false); }}
              className="w-full h-13 bg-primary text-primary-foreground rounded-xl font-bold uppercase tracking-widest text-sm tap-scale glow-primary"
            >
              BACK TO LOGIN
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      {/* Brand */}
      <div className="mb-10 text-center">
        <h1 className="font-lexend font-black text-4xl text-primary tracking-widest uppercase text-glow-primary">
          DAY 1
        </h1>
        <p className="text-white/40 text-xs uppercase tracking-widest mt-2">Track. Train. Transform.</p>
      </div>

      <div className="w-full max-w-sm">
        <div className="glass-card rounded-2xl p-6">
          {/* Mode toggle */}
          <div className="flex mb-6 glass-card rounded-xl p-1">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 h-10 text-sm font-bold uppercase tracking-widest rounded-lg tap-scale transition-all ${
                mode === 'login'
                  ? 'bg-primary text-primary-foreground glow-primary-sm'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              LOG IN
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); }}
              className={`flex-1 h-10 text-sm font-bold uppercase tracking-widest rounded-lg tap-scale transition-all ${
                mode === 'signup'
                  ? 'bg-primary text-primary-foreground glow-primary-sm'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              SIGN UP
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-white/50 mb-2">
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-sm focus:outline-none focus:border-primary/60 transition-colors"
                placeholder="you@example.com"
              />
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/50 mb-2">
                  USERNAME
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-sm focus:outline-none focus:border-primary/60 transition-colors"
                  placeholder="yourname"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-white/50 mb-2">
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-sm focus:outline-none focus:border-primary/60 transition-colors"
                placeholder="••••••"
              />
            </div>

            {error && (
              <p className="text-destructive text-xs font-medium bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-13 bg-primary text-primary-foreground rounded-xl font-bold uppercase tracking-widest text-sm tap-scale glow-primary disabled:opacity-50 disabled:cursor-not-allowed mt-2 py-3"
            >
              {loading ? '...' : mode === 'login' ? 'LOG IN' : 'SIGN UP'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
