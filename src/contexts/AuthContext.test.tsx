import { act, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from '@/components/ProtectedRoute';
import GuestRoute from '@/components/GuestRoute';
import type { Role, User } from '@/lib/types';
import { ApiError } from '@/lib/api';
import { AuthProvider, useAuth, type ProfileCompleter, type ProfileLoader, type ProfileUpdater } from './AuthContext';

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

type AuthTestClient = SupabaseClient & {
  emitAuthStateChange: (event: AuthChangeEvent, nextSession: Session | null) => void;
};

function authClient(restoredSession: Session | null = null): AuthTestClient {
  const unsubscribe = vi.fn();
  let authStateListener: ((event: AuthChangeEvent, nextSession: Session | null) => void) | undefined;
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: restoredSession }, error: null }),
      onAuthStateChange: vi.fn((listener: (event: AuthChangeEvent, nextSession: Session | null) => void) => {
        authStateListener = listener;
        return { data: { subscription: { unsubscribe } } };
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session, user: session.user }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { session: null, user: session.user }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: { user: session.user }, error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  } as unknown as AuthTestClient;
  client.emitAuthStateChange = (event, nextSession) => authStateListener?.(event, nextSession);
  return client;
}

function AuthProbe() {
  const {
    login,
    register,
    updateProfile,
    changePassword,
    setInitialPassword,
    requestPasswordReset,
    completePasswordRecovery,
    isPasswordRecovery,
    needsPasswordSetup,
    user,
  } = useAuth();
  const [registrationError, setRegistrationError] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  return <div>
    <span>{user?.role ?? 'guest'}</span>
    <span>{user?.name ?? 'no name'}</span>
    <span>{needsPasswordSetup ? 'password setup required' : 'password ready'}</span>
    <span>{isPasswordRecovery ? 'recovery active' : 'recovery inactive'}</span>
    <button onClick={() => void login('user@example.com', 'password')}>login</button>
    <button onClick={() => void register('User', '01700000000', 'user@example.com', 'password').catch((error: Error) => setRegistrationError(error.message))}>register</button>
    <button onClick={() => void register('User', '', 'user@example.com', 'password').catch(() => undefined)}>register without phone</button>
    <button onClick={() => void updateProfile('Updated User', '01800000000')}>update profile</button>
    <button onClick={() => void changePassword('old-password', 'new-password')}>change password</button>
    <button onClick={() => void setInitialPassword('invited-password')}>set initial password</button>
    <button onClick={() => void requestPasswordReset('user@example.com')}>request password reset</button>
    <button onClick={() => void completePasswordRecovery('recovered-password').catch((error: Error) => setRecoveryError(error.message))}>complete password recovery</button>
    {registrationError && <span>{registrationError}</span>}
    {recoveryError && <span>{recoveryError}</span>}
  </div>;
}

describe('Supabase frontend authentication', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

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

  it('updates the authoritative profile and refreshes context state', async () => {
    const updated = { ...profile('CUSTOMER'), name: 'Updated User', phoneNumber: '01800000000' };
    const saveProfile = vi.fn<ProfileUpdater>().mockResolvedValue(updated);
    render(<AuthProvider client={authClient(session)} loadProfile={vi.fn<ProfileLoader>().mockResolvedValue(profile('CUSTOMER'))} saveProfile={saveProfile}><AuthProbe /></AuthProvider>);
    expect(await screen.findByText('CUSTOMER')).toBeInTheDocument();
    await act(async () => screen.getByText('update profile').click());
    expect(saveProfile).toHaveBeenCalledWith({ fullName: 'Updated User', phoneNumber: '01800000000' });
    expect(await screen.findByText('Updated User')).toBeInTheDocument();
  });

  it('reauthenticates before changing the Supabase password', async () => {
    const client = authClient(session);
    render(<AuthProvider client={client} loadProfile={vi.fn<ProfileLoader>().mockResolvedValue(profile('OWNER'))}><AuthProbe /></AuthProvider>);
    expect(await screen.findByText('OWNER')).toBeInTheDocument();
    await act(async () => screen.getByText('change password').click());
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'user@example.com', password: 'old-password' });
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'new-password' });
  });

  it('lets an invited owner set the initial password without an old password', async () => {
    const invitedSession = {
      ...session,
      user: { ...session.user, user_metadata: { nafah_owner_invite_pending: true } },
    } as Session;
    const client = authClient(invitedSession);
    vi.mocked(client.auth.updateUser).mockResolvedValue({
      data: { user: { ...invitedSession.user, user_metadata: { nafah_owner_invite_pending: false } } },
      error: null,
    } as Awaited<ReturnType<typeof client.auth.updateUser>>);
    render(<AuthProvider client={client} loadProfile={vi.fn<ProfileLoader>().mockResolvedValue(profile('OWNER'))}><AuthProbe /></AuthProvider>);
    expect(await screen.findByText('password setup required')).toBeInTheDocument();
    await act(async () => screen.getByText('set initial password').click());
    expect(client.auth.updateUser).toHaveBeenCalledWith({
      password: 'invited-password', data: { nafah_owner_invite_pending: false },
    });
    expect(await screen.findByText('password ready')).toBeInTheDocument();
  });

  it('requests the same Supabase password-recovery flow regardless of application role', async () => {
    const client = authClient();
    render(<AuthProvider client={client} loadProfile={vi.fn()}><AuthProbe /></AuthProvider>);
    await screen.findByText('guest');
    await act(async () => screen.getByText('request password reset').click());
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  });

  it('accepts a Supabase recovery event without loading an application profile', async () => {
    const client = authClient();
    const loadProfile = vi.fn<ProfileLoader>();
    render(<AuthProvider client={client} loadProfile={loadProfile}><AuthProbe /></AuthProvider>);
    await screen.findByText('recovery inactive');

    act(() => client.emitAuthStateChange('PASSWORD_RECOVERY', session));
    expect(await screen.findByText('recovery active')).toBeInTheDocument();
    expect(loadProfile).not.toHaveBeenCalled();

    await act(async () => screen.getByText('complete password recovery').click());
    expect(client.auth.updateUser).toHaveBeenCalledWith({
      password: 'recovered-password',
      data: { nafah_owner_invite_pending: false },
    });
    expect(client.auth.signOut).toHaveBeenCalled();
    expect(await screen.findByText('recovery inactive')).toBeInTheDocument();
  });

  it('does not let an ordinary authenticated session use password recovery', async () => {
    const client = authClient(session);
    render(<AuthProvider client={client} loadProfile={vi.fn<ProfileLoader>().mockResolvedValue(profile('OWNER'))}><AuthProbe /></AuthProvider>);
    expect(await screen.findByText('OWNER')).toBeInTheDocument();
    await act(async () => screen.getByText('complete password recovery').click());
    expect(await screen.findByText(/recovery link is invalid or has expired/i)).toBeInTheDocument();
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });

  it('clears an abandoned recovery state when the user signs in normally', async () => {
    const client = authClient();
    render(<AuthProvider client={client} loadProfile={vi.fn<ProfileLoader>().mockResolvedValue(profile('CUSTOMER'))}><AuthProbe /></AuthProvider>);
    await screen.findByText('recovery inactive');
    act(() => client.emitAuthStateChange('PASSWORD_RECOVERY', session));
    expect(await screen.findByText('recovery active')).toBeInTheDocument();

    await act(async () => screen.getByText('login').click());
    expect(await screen.findByText('CUSTOMER')).toBeInTheDocument();
    expect(screen.getByText('recovery inactive')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('nafah-agro-password-recovery')).toBeNull();
  });
});

describe('protected frontend routes', () => {
  function LoginProbe() {
    const location = useLocation();
    return <div>login page {(location.state as { from?: string } | null)?.from}</div>;
  }

  function renderRoute(role: Role | null) {
    const loadProfile = vi.fn<ProfileLoader>().mockResolvedValue(profile(role ?? 'CUSTOMER'));
    render(
      <AuthProvider client={authClient(role ? session : null)} loadProfile={loadProfile}>
        <MemoryRouter initialEntries={['/admin/orders']}>
          <Routes>
            <Route path="/login" element={<LoginProbe />} />
            <Route path="/profile" element={<div>profile page</div>} />
            <Route path="/admin/*" element={<ProtectedRoute roles={['OWNER']}><div>management panel</div></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('redirects a guest to login', async () => {
    renderRoute(null);
    expect(await screen.findByText('login page /admin/orders')).toBeInTheDocument();
  });

  it('allows an OWNER into management routes', async () => {
    renderRoute('OWNER');
    expect(await screen.findByText('management panel')).toBeInTheDocument();
  });

  it('denies a CUSTOMER access to management routes', async () => {
    renderRoute('CUSTOMER');
    await waitFor(() => expect(screen.getByText('profile page')).toBeInTheDocument());
  });

  it.each([
    ['OWNER' as const, 'owner landing'],
    ['CUSTOMER' as const, 'customer landing'],
  ])('redirects a signed-in %s away from guest auth pages', async (role, expected) => {
    render(
      <AuthProvider client={authClient(session)} loadProfile={vi.fn<ProfileLoader>().mockResolvedValue(profile(role))}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<GuestRoute><div>login form</div></GuestRoute>} />
            <Route path="/admin/dashboard" element={<div>owner landing</div>} />
            <Route path="/profile" element={<div>customer landing</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.queryByText('login form')).not.toBeInTheDocument();
  });
});
