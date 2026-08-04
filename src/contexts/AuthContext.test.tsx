import { act, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import ProtectedRoute from '@/components/ProtectedRoute';
import type { Role, User } from '@/lib/types';
import { ApiError } from '@/lib/api';
import { AuthProvider, useAuth, type ProfileCompleter, type ProfileLoader } from './AuthContext';

const session = {
  access_token: 'supabase-access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'b6ec35a8-e7da-4d96-8c53-f123b41d4772' },
} as unknown as Session;

function profile(role: Role): User {
  return {
    id: session.user.id, name: 'Nafah User', email: 'user@example.com',
    phoneNumber: '01700000000', role, isActive: true,
  };
}

function authClient(restoredSession: Session | null = null) {
  const unsubscribe = vi.fn();
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: restoredSession }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe } } }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session, user: session.user }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { session: null, user: session.user }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  } as unknown as SupabaseClient;
  return client;
}

function AuthProbe() {
  const { login, register, user } = useAuth();
  const [registrationError, setRegistrationError] = useState('');
  return <div>
    <span>{user?.role ?? 'guest'}</span>
    <button onClick={() => void login('user@example.com', 'password')}>login</button>
    <button onClick={() => void register('User', '01700000000', 'user@example.com', 'password').catch((error: Error) => setRegistrationError(error.message))}>register</button>
    <button onClick={() => void register('User', '', 'user@example.com', 'password').catch(() => undefined)}>register without phone</button>
    {registrationError && <span>{registrationError}</span>}
  </div>;
}

describe('Supabase frontend authentication', () => {
  it('restores a Supabase session and resolves its PostgreSQL profile', async () => {
    const loadProfile = vi.fn<ProfileLoader>().mockResolvedValue(profile('CUSTOMER'));
    render(<AuthProvider client={authClient(session)} loadProfile={loadProfile}><AuthProbe /></AuthProvider>);
    expect(await screen.findByText('CUSTOMER')).toBeInTheDocument();
    expect(loadProfile).toHaveBeenCalledWith('supabase-access-token');
  });

  it('logs in through Supabase and then loads the authoritative profile', async () => {
    const client = authClient();
    const loadProfile = vi.fn<ProfileLoader>().mockResolvedValue(profile('OWNER'));
    render(<AuthProvider client={client} loadProfile={loadProfile}><AuthProbe /></AuthProvider>);
    await screen.findByText('guest');
    await act(async () => screen.getByText('login').click());
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'user@example.com', password: 'password' });
    expect(await screen.findByText('OWNER')).toBeInTheDocument();
  });

  it('registers only a CUSTOMER profile request with the required phone metadata', async () => {
    const client = authClient();
    render(<AuthProvider client={client} loadProfile={vi.fn()}><AuthProbe /></AuthProvider>);
    await screen.findByText('guest');
    await act(async () => screen.getByText('register').click());
    expect(client.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: { data: { full_name: 'User', phone_number: '01700000000', nafah_role: 'CUSTOMER' } },
    }));
  });

  it('rejects registration without a phone before calling Supabase', async () => {
    const client = authClient();
    render(<AuthProvider client={client} loadProfile={vi.fn()}><AuthProbe /></AuthProvider>);
    await screen.findByText('guest');
    await act(async () => screen.getByText('register without phone').click());
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it('reports a clean registration failure when the database profile trigger rejects signup', async () => {
    const client = authClient();
    vi.mocked(client.auth.signUp).mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Database error saving new user' },
    } as Awaited<ReturnType<typeof client.auth.signUp>>);
    render(<AuthProvider client={client} loadProfile={vi.fn()}><AuthProbe /></AuthProvider>);
    await screen.findByText('guest');
    await act(async () => screen.getByText('register').click());
    expect(await screen.findByText(/Account setup failed and no usable profile was created/)).toBeInTheDocument();
  });

  it('repairs a missing trigger-created CUSTOMER profile from verified session metadata', async () => {
    const sessionWithMetadata = {
      ...session,
      user: {
        ...session.user,
        user_metadata: { full_name: 'Nafah User', phone_number: '01700000000' },
      },
    } as Session;
    const loadProfile = vi.fn<ProfileLoader>()
      .mockRejectedValueOnce(new ApiError('Profile required', 'PROFILE_REQUIRED', 403))
      .mockResolvedValueOnce(profile('CUSTOMER'));
    const completeProfile = vi.fn<ProfileCompleter>().mockResolvedValue(profile('CUSTOMER'));
    render(
      <AuthProvider client={authClient(sessionWithMetadata)} loadProfile={loadProfile} completeProfile={completeProfile}>
        <AuthProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText('CUSTOMER')).toBeInTheDocument();
    expect(completeProfile).toHaveBeenCalledWith('supabase-access-token');
  });
});

describe('protected frontend routes', () => {
  function renderRoute(role: Role | null) {
    const loadProfile = vi.fn<ProfileLoader>().mockResolvedValue(profile(role ?? 'CUSTOMER'));
    render(
      <AuthProvider client={authClient(role ? session : null)} loadProfile={loadProfile}>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/login" element={<div>login page</div>} />
            <Route path="/" element={<div>storefront</div>} />
            <Route path="/admin" element={<ProtectedRoute roles={['OWNER']}><div>management panel</div></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('redirects a guest to login', async () => {
    renderRoute(null);
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('allows an OWNER into management routes', async () => {
    renderRoute('OWNER');
    expect(await screen.findByText('management panel')).toBeInTheDocument();
  });

  it('denies a CUSTOMER access to management routes', async () => {
    renderRoute('CUSTOMER');
    await waitFor(() => expect(screen.getByText('storefront')).toBeInTheDocument());
  });
});
