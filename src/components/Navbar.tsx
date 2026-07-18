import { Link } from 'react-router-dom';
import { ShoppingCart, Menu, X, LogOut, User as UserIcon } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import logo from '@/assets/logo.avif';

const roleBadge: Record<string, { label: string; className: string }> = {
  admin: { label: 'অ্যাডমিন', className: 'bg-red-500/20 text-red-300' },
  moderator: { label: 'মডারেটর', className: 'bg-yellow-500/20 text-yellow-300' },
  customer: { label: 'কাস্টমার', className: 'bg-green-500/20 text-green-300' },
};

const Navbar = () => {
  const { totalItems } = useCart();
  const { user, isAuthenticated, logout, isAdmin, isModerator } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { to: '/', label: 'হোম' },
    { to: '/shop', label: 'দোকান' },
    ...(isAdmin ? [{ to: '/admin', label: 'অ্যাডমিন প্যানেল' }] : []),
    ...(isModerator ? [{ to: '/moderator', label: 'মডারেটর প্যানেল' }] : []),
    ...(isAuthenticated ? [{ to: '/profile', label: 'প্রোফাইল' }] : []),
  ];

  return (
    <nav className="sticky top-0 z-50 bg-primary text-primary-foreground shadow-lg">
      <div className="container mx-auto flex items-center justify-between py-3 px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="খামারবাড়ি" className="h-10 w-10 rounded-full bg-primary-foreground/10" />
          <span className="text-xl font-bold tracking-wide">খামারবাড়ি</span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map(l => (
            <Link key={l.to} to={l.to} className="hover:text-accent transition-colors font-medium">
              {l.label}
            </Link>
          ))}
          <Link to="/cart" className="relative hover:text-accent transition-colors">
            <ShoppingCart size={22} />
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 bg-accent text-accent-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </Link>

          {isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              <Link to="/profile" className="flex items-center gap-2 hover:text-accent transition-colors">
                <UserIcon size={18} />
                <span className="text-sm font-medium">{user.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${roleBadge[user.role]?.className}`}>
                  {roleBadge[user.role]?.label}
                </span>
              </Link>
              <button
                onClick={logout}
                className="hover:text-accent transition-colors"
                title="লগআউট"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <Link to="/login" className="hover:text-accent transition-colors font-medium">
              লগইন
            </Link>
          )}
        </div>

        {/* Mobile toggle */}
        <div className="flex md:hidden items-center gap-3">
          <Link to="/cart" className="relative hover:text-accent transition-colors">
            <ShoppingCart size={22} />
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 bg-accent text-accent-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </Link>
          <button onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-primary border-t border-secondary/30 px-4 pb-4">
          {navLinks.map(l => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setMobileOpen(false)}
              className="block py-2 hover:text-accent transition-colors font-medium"
            >
              {l.label}
            </Link>
          ))}

          {isAuthenticated && user ? (
            <div className="pt-2 border-t border-secondary/30 mt-2">
              <Link
                to="/profile"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 py-2 hover:text-accent transition-colors"
              >
                <UserIcon size={16} />
                <span className="text-sm">{user.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${roleBadge[user.role]?.className}`}>
                  {roleBadge[user.role]?.label}
                </span>
              </Link>
              <button
                onClick={() => { logout(); setMobileOpen(false); }}
                className="flex items-center gap-2 py-2 hover:text-accent transition-colors font-medium"
              >
                <LogOut size={16} />
                লগআউট
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="block py-2 hover:text-accent transition-colors font-medium"
            >
              লগইন
            </Link>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
