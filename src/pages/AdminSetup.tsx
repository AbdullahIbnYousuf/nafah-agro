import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { registerAdmin } from '@/lib/api';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { toast } from 'sonner';
import { Lock, ShieldCheck } from 'lucide-react';

const AdminSetup = () => {
  const [step, setStep] = useState<'unlock' | 'register'>('unlock');
  const [unlockCode, setUnlockCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuthData } = useAuth();
  const navigate = useNavigate();

  const handleUnlock = (e: FormEvent) => {
    e.preventDefault();
    if (!unlockCode.trim()) {
      toast.error('আনলক কোড দিন');
      return;
    }
    // We pass the code to server on registration; this step just gates the UI
    setStep('register');
    toast.success('আনলক সফল! এখন অ্যাডমিন অ্যাকাউন্ট তৈরি করুন');
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('পাসওয়ার্ড মিলছে না');
      return;
    }
    if (password.length < 6) {
      toast.error('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');
      return;
    }
    setLoading(true);
    try {
      const res = await registerAdmin(name, email, password, unlockCode);
      setAuthData(res.token, res.user);
      toast.success('অ্যাডমিন অ্যাকাউন্ট তৈরি হয়েছে!');
      navigate('/admin');
    } catch (err: any) {
      toast.error(err.message || 'অ্যাডমিন তৈরি ব্যর্থ হয়েছে');
      // If unlock code was wrong, go back to unlock step
      if (err.message?.includes('unlock code')) {
        setStep('unlock');
        setUnlockCode('');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-2xl shadow-xl border border-border p-8">
            {step === 'unlock' ? (
              <>
                <div className="text-center mb-8">
                  <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                    <Lock className="w-8 h-8 text-primary" />
                  </div>
                  <h1 className="text-3xl font-bold text-foreground">অ্যাডমিন সেটআপ</h1>
                  <p className="text-muted-foreground mt-2">অ্যাডমিন অ্যাকাউন্ট তৈরি করতে আনলক কোড দিন</p>
                </div>

                <form onSubmit={handleUnlock} className="space-y-5">
                  <div>
                    <label htmlFor="unlock-code" className="block text-sm font-medium text-foreground mb-1.5">
                      আনলক কোড
                    </label>
                    <input
                      id="unlock-code"
                      type="password"
                      required
                      value={unlockCode}
                      onChange={(e) => setUnlockCode(e.target.value)}
                      placeholder="আনলক কোড লিখুন"
                      className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
                  >
                    আনলক করুন
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="text-center mb-8">
                  <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
                    <ShieldCheck className="w-8 h-8 text-green-500" />
                  </div>
                  <h1 className="text-3xl font-bold text-foreground">অ্যাডমিন রেজিস্ট্রেশন</h1>
                  <p className="text-muted-foreground mt-2">অ্যাডমিন অ্যাকাউন্টের তথ্য দিন</p>
                </div>

                <form onSubmit={handleRegister} className="space-y-5">
                  <div>
                    <label htmlFor="admin-name" className="block text-sm font-medium text-foreground mb-1.5">
                      নাম
                    </label>
                    <input
                      id="admin-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="আপনার পুরো নাম"
                      className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                    />
                  </div>

                  <div>
                    <label htmlFor="admin-email" className="block text-sm font-medium text-foreground mb-1.5">
                      ইমেইল
                    </label>
                    <input
                      id="admin-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@example.com"
                      className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                    />
                  </div>

                  <div>
                    <label htmlFor="admin-password" className="block text-sm font-medium text-foreground mb-1.5">
                      পাসওয়ার্ড
                    </label>
                    <input
                      id="admin-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="কমপক্ষে ৬ অক্ষর"
                      className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                    />
                  </div>

                  <div>
                    <label htmlFor="admin-confirm" className="block text-sm font-medium text-foreground mb-1.5">
                      পাসওয়ার্ড নিশ্চিত করুন
                    </label>
                    <input
                      id="admin-confirm"
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="পাসওয়ার্ড আবার লিখুন"
                      className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {loading ? 'তৈরি হচ্ছে...' : 'অ্যাডমিন অ্যাকাউন্ট তৈরি করুন'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default AdminSetup;
