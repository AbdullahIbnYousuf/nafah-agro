import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
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
      const needsConfirmation = await register(name, phoneNumber, email, password);
      toast.success(needsConfirmation
        ? 'ইমেইল নিশ্চিত করে লগইন করুন।'
        : 'রেজিস্ট্রেশন সফল হয়েছে!');
      navigate(needsConfirmation ? '/login' : '/');
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'রেজিস্ট্রেশন ব্যর্থ হয়েছে'));
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
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-foreground">রেজিস্ট্রেশন</h1>
              <p className="text-muted-foreground mt-2">নতুন অ্যাকাউন্ট তৈরি করুন</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="register-phone" className="block text-sm font-medium text-foreground mb-1.5">
                  ফোন নম্বর
                </label>
                <input
                  id="register-phone"
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                />
              </div>

              <div>
                <label htmlFor="register-name" className="block text-sm font-medium text-foreground mb-1.5">
                  নাম
                </label>
                <input
                  id="register-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="আপনার পুরো নাম"
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                />
              </div>

              <div>
                <label htmlFor="register-email" className="block text-sm font-medium text-foreground mb-1.5">
                  ইমেইল
                </label>
                <input
                  id="register-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                />
              </div>

              <div>
                <label htmlFor="register-password" className="block text-sm font-medium text-foreground mb-1.5">
                  পাসওয়ার্ড
                </label>
                <input
                  id="register-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="কমপক্ষে ৬ অক্ষর"
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                />
              </div>

              <div>
                <label htmlFor="register-confirm" className="block text-sm font-medium text-foreground mb-1.5">
                  পাসওয়ার্ড নিশ্চিত করুন
                </label>
                <input
                  id="register-confirm"
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
                {loading ? 'রেজিস্ট্রেশন হচ্ছে...' : 'রেজিস্ট্রেশন করুন'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                ইতিমধ্যে অ্যাকাউন্ট আছে?{' '}
                <Link to="/login" className="text-primary font-medium hover:underline">
                  লগইন করুন
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Register;
