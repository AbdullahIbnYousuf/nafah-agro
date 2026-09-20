import { useEffect, useState, FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const RECOVERY_CONFIRMATION = 'এই ইমেইলে অ্যাকাউন্ট থাকলে পাসওয়ার্ড পরিবর্তনের লিংক পাঠানো হয়েছে। ইনবক্স ও স্প্যাম ফোল্ডার দেখুন।';

function recoveryErrorMessage(error: unknown) {
  const message = getErrorMessage(error, 'ইমেইল পাঠানো যায়নি। কিছুক্ষণ পর রিট্রাই করুন।');
  if (/rate limit|too many requests|security purposes/i.test(message)) {
    return 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ অপেক্ষা করে রিট্রাই করুন।';
  }
  return message;
}

function isUnknownAccountRecoveryError(error: unknown) {
  const message = getErrorMessage(error, '');
  return /user not found|email not found|no user|not registered/i.test(message);
}

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryCooldown, setRecoveryCooldown] = useState(0);
  const { login, requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (recoveryCooldown <= 0) return;
    const timer = window.setTimeout(() => {
      setRecoveryCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [recoveryCooldown]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const profile = await login(email, password);
      toast.success('সফলভাবে লগইন হয়েছে!');
      const requestedPath = (location.state as { from?: unknown } | null)?.from;
      const safeRequestedPath = typeof requestedPath === 'string'
        && requestedPath.startsWith('/')
        && !requestedPath.startsWith('//')
        ? requestedPath
        : null;
      navigate(safeRequestedPath ?? (profile.role === 'OWNER' ? '/admin/dashboard' : '/profile'), { replace: true });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'লগইন ব্যর্থ হয়েছে'));
    } finally {
      setLoading(false);
    }
  };

  const openRecoveryDialog = () => {
    setRecoveryEmail(email);
    setRecoveryError('');
    setRecoveryOpen(true);
  };

  const handleRecoverySubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (recoveryCooldown > 0) return;
    setRecoveryLoading(true);
    setRecoveryError('');
    try {
      await requestPasswordReset(recoveryEmail);
      setRecoverySent(true);
      setRecoveryCooldown(60);
    } catch (error: unknown) {
      if (isUnknownAccountRecoveryError(error)) {
        setRecoverySent(true);
        setRecoveryCooldown(60);
      } else {
        setRecoveryError(recoveryErrorMessage(error));
      }
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-2xl shadow-xl border border-border p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-foreground">লগইন</h1>
              <p className="text-muted-foreground mt-2">আপনার অ্যাকাউন্টে লগইন করুন</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-foreground mb-1.5">
                  ইমেইল
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-foreground mb-1.5">
                  পাসওয়ার্ড
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                />
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={openRecoveryDialog}
                    className="text-sm text-muted-foreground transition hover:text-primary hover:underline"
                  >
                    পাসওয়ার্ড ভুলে গেছেন?
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? 'লগইন হচ্ছে...' : 'লগইন করুন'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                অ্যাকাউন্ট নেই?{' '}
                <Link to="/register" className="text-primary font-medium hover:underline">
                  রেজিস্ট্রেশন করুন
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />

      <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>পাসওয়ার্ড পরিবর্তনের লিংক</DialogTitle>
            <DialogDescription>
              আপনার অ্যাকাউন্টের ইমেইল দিন। সেখানে পাসওয়ার্ড পরিবর্তনের লিংক পাঠানো হবে।
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecoverySubmit} className="space-y-4">
            <div>
              <label htmlFor="recovery-email" className="mb-1.5 block text-sm font-medium text-foreground">
                ইমেইল
              </label>
              <input
                id="recovery-email"
                type="email"
                required
                autoComplete="email"
                value={recoveryEmail}
                onChange={(event) => setRecoveryEmail(event.target.value)}
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {recoverySent && (
              <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground" role="status">
                {RECOVERY_CONFIRMATION}
              </p>
            )}
            {recoveryError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                {recoveryError}
              </p>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <button
                type="button"
                onClick={() => setRecoveryOpen(false)}
                className="rounded-lg border border-input px-4 py-2.5 font-medium text-foreground transition hover:bg-muted"
              >
                বন্ধ করুন
              </button>
              <button
                type="submit"
                disabled={recoveryLoading || recoveryCooldown > 0}
                className="rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {recoveryLoading
                  ? 'পাঠানো হচ্ছে...'
                  : recoveryCooldown > 0
                    ? `আবার পাঠাতে ${recoveryCooldown} সেকেন্ড`
                    : recoverySent
                      ? 'আবার লিংক পাঠান'
                      : 'লিংক পাঠান'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;
