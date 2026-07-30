import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { loginModerator, requestModeratorPasswordReset } from '@/lib/api';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getErrorMessage } from '@/lib/utils';
import { ShieldCheck, KeyRound, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const ModeratorLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const { setAuthData } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await loginModerator(email, password);
      setAuthData(res.token, res.user);
      toast.success('মডারেটর হিসেবে লগইন সফল!');
      navigate('/moderator');
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'লগইন ব্যর্থ হয়েছে'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      toast.error('আপনার ইমেইল দিন');
      return;
    }
    setResetLoading(true);
    try {
      await requestModeratorPasswordReset(resetEmail.trim());
      setResetSent(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'রিকুয়েস্ট পাঠাতে ব্যর্থ হয়েছে'));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-2xl shadow-xl border border-border p-8">
            {!showResetForm ? (
              <>
                <div className="text-center mb-8">
                  <div className="mx-auto w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mb-4">
                    <ShieldCheck className="w-8 h-8 text-yellow-500" />
                  </div>
                  <h1 className="text-3xl font-bold text-foreground">মডারেটর লগইন</h1>
                  <p className="text-muted-foreground mt-2">মডারেটর প্যানেলে প্রবেশ করুন</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <label htmlFor="mod-email" className="block text-sm font-medium text-foreground mb-1.5">
                      ইমেইল
                    </label>
                    <input
                      id="mod-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="moderator@example.com"
                      className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                    />
                  </div>

                  <div>
                    <label htmlFor="mod-password" className="block text-sm font-medium text-foreground mb-1.5">
                      পাসওয়ার্ড
                    </label>
                    <input
                      id="mod-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {loading ? 'লগইন হচ্ছে...' : 'মডারেটর লগইন'}
                  </button>
                </form>

                <div className="mt-6 text-center space-y-2">
                  <button
                    onClick={() => setShowResetForm(true)}
                    className="text-sm text-muted-foreground hover:text-primary hover:underline flex items-center gap-1.5 mx-auto"
                  >
                    <KeyRound size={14} />
                    পাসওয়ার্ড ভুলে গেছেন?
                  </button>
                  <p className="text-sm text-muted-foreground">
                    কাস্টমার?{' '}
                    <Link to="/login" className="text-primary font-medium hover:underline">
                      কাস্টমার লগইন
                    </Link>
                  </p>
                </div>
              </>
            ) : resetSent ? (
              <div className="text-center py-8">
                <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
                <h2 className="text-xl font-bold mb-2">রিকুয়েস্ট পাঠানো হয়েছে!</h2>
                <p className="text-muted-foreground mb-6">
                  অ্যাডমিন আপনার পাসওয়ার্ড রিসেট করলে আপনাকে জানানো হবে। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।
                </p>
                <button
                  onClick={() => { setShowResetForm(false); setResetSent(false); setResetEmail(''); }}
                  className="text-primary font-medium hover:underline"
                >
                  লগইনে ফিরে যান
                </button>
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                    <KeyRound className="w-8 h-8 text-primary" />
                  </div>
                  <h1 className="text-2xl font-bold text-foreground">পাসওয়ার্ড রিসেট রিকুয়েস্ট</h1>
                  <p className="text-muted-foreground mt-2">আপনার ইমেইল দিন, অ্যাডমিন পাসওয়ার্ড রিসেট করবেন</p>
                </div>

                <form onSubmit={handleResetRequest} className="space-y-5">
                  <div>
                    <label htmlFor="reset-email" className="block text-sm font-medium text-foreground mb-1.5">
                      মডারেটর ইমেইল
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="moderator@example.com"
                      className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                      autoFocus
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {resetLoading ? 'পাঠানো হচ্ছে...' : 'রিসেট রিকুয়েস্ট পাঠান'}
                  </button>
                </form>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => { setShowResetForm(false); setResetEmail(''); }}
                    className="text-sm text-muted-foreground hover:text-primary hover:underline"
                  >
                    লগইনে ফিরে যান
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ModeratorLogin;
