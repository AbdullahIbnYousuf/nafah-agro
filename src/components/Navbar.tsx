import { Link } from 'react-router-dom';
import { ChevronDown, Settings, ShoppingCart, Menu, X, LogOut, User as UserIcon } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import logo from '@/assets/logo.avif';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const roleBadge: Record<string, { label: string; className: string }> = {
  OWNER: { label: 'ওনার', className: 'bg-amber-500/20 text-amber-200' },
  CUSTOMER: { label: 'কাস্টমার', className: 'bg-green-500/20 text-green-300' },
};

const Navbar = () => {
  const { totalItems } = useCart();
  const { user, isAuthenticated, logout, isOwner } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { to: '/', label: 'হোম' },
    { to: '/shop', label: 'দোকান' },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-primary text-primary-foreground shadow-lg">
      <div className="container mx-auto flex items-center justify-between py-3 px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="নাফাহ এগ্রো" className="h-10 w-10 rounded-full bg-primary-foreground/10" />
          <span className="text-xl font-bold tracking-wide">নাফাহ এগ্রো</span>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button type="button" className="flex items-center gap-2 hover:text-accent transition-colors"><UserIcon size={18} /><span className="text-sm font-medium max-w-32 truncate">{user.name}</span><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${roleBadge[user.role]?.className}`}>{roleBadge[user.role]?.label}</span><ChevronDown size={14} /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56"><DropdownMenuLabel><span className="block truncate">{user.name}</span><span className="block text-xs font-normal text-muted-foreground truncate">{user.email}</span></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem asChild><Link to="/profile"><UserIcon size={16} className="mr-2" />আমার প্রোফাইল</Link></DropdownMenuItem>{isOwner && <DropdownMenuItem asChild><Link to="/admin"><Settings size={16} className="mr-2" />পরিচালনা প্যানেল</Link></DropdownMenuItem>}<DropdownMenuSeparator /><DropdownMenuItem onSelect={() => void logout()} className="text-destructive"><LogOut size={16} className="mr-2" />লগআউট</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
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
              {isOwner && <Link to="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 py-2 hover:text-accent transition-colors"><Settings size={16} />পরিচালনা প্যানেল</Link>}
              <button
                onClick={() => { void logout(); setMobileOpen(false); }}
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
