import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export default function GuestRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isOwner, loading, needsPasswordSetup } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;
  }

  if (isAuthenticated) {
    const destination = needsPasswordSetup || !isOwner ? '/profile' : '/admin/dashboard';
    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
}
