import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/lib/utils';

function recoveryErrorMessage(error: unknown) {
  const message = getErrorMessage(error, 'পাসওয়ার্ড আপডেট করা যায়নি। রিট্রাই করুন।');
  if (/expired|invalid|recovery link/i.test(message)) {
    return 'লিংকটি সঠিক নয় অথবা লিংক এক্সপায়ার হয়েছে। লগইন পেজ থেকে নতুন লিংক নিন।';
  }
  return message;
}

export default function ResetPassword() {
  const { completePasswordRecovery, isPasswordRecovery, loading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('পাসওয়ার্ড কমপক্ষে 8 অক্ষরের হতে হবে।');
      return;
    }
    if (password !== confirmation) {
      setError('দুইটি পাসওয়ার্ড মিলছে না।');
      return;
    }

    setSubmitting(true);
    try {
      await completePasswordRecovery(password);
      toast.success('পাসওয়ার্ড পরিবর্তন হয়েছে। নতুন পাসওয়ার্ড দিয়ে লগইন করুন।');
      navigate('/login', { replace: true });
    } catch (recoveryError: unknown) {
      setError(recoveryErrorMessage(recoveryError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center" role="status">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
              <span className="sr-only">লিংক যাচাই হচ্ছে</span>
            </div>
          ) : !isPasswordRecovery ? (
            <div className="space-y-5 text-center">
              <div>
                <h1 className="text-2xl font-bold text-foreground">লিংকটি কাজ করছে না</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  লিংকটি সঠিক নয় অথবা লিংক এক্সপায়ার হয়েছে। লগইন পেজ থেকে নতুন লিংক নিন।
                </p>
              </div>
              <Link
                to="/login"
                className="inline-flex rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                লগইন পেজে যান
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-7 text-center">
                <h1 className="text-3xl font-bold text-foreground">নতুন পাসওয়ার্ড দিন</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  কমপক্ষে 8 অক্ষরের একটি নতুন পাসওয়ার্ড দিন।
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-foreground">
                    নতুন পাসওয়ার্ড
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-foreground">
                    আবার পাসওয়ার্ড দিন
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                {error && (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'পরিবর্তন হচ্ছে...' : 'পাসওয়ার্ড পরিবর্তন করুন'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
