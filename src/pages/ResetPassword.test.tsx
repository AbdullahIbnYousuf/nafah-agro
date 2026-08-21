import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResetPassword from './ResetPassword';

const mocks = vi.hoisted(() => ({
  completePasswordRecovery: vi.fn(),
  toastSuccess: vi.fn(),
  auth: { isPasswordRecovery: true, loading: false },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    completePasswordRecovery: mocks.completePasswordRecovery,
    isPasswordRecovery: mocks.auth.isPasswordRecovery,
    loading: mocks.auth.loading,
  }),
}));
vi.mock('@/components/Navbar', () => ({ default: () => <nav>Navbar</nav> }));
vi.mock('@/components/Footer', () => ({ default: () => <footer>Footer</footer> }));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess } }));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<div>login destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function submitPasswords(password: string, confirmation: string) {
  fireEvent.change(screen.getByLabelText('নতুন পাসওয়ার্ড'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('আবার পাসওয়ার্ড দিন'), { target: { value: confirmation } });
  const form = screen.getByRole('button', { name: 'পাসওয়ার্ড পরিবর্তন করুন' }).closest('form');
  if (!form) throw new Error('Password form was not rendered.');
  fireEvent.submit(form);
}

describe('password recovery page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.isPasswordRecovery = true;
    mocks.auth.loading = false;
    mocks.completePasswordRecovery.mockResolvedValue(undefined);
  });

  it('does not show password inputs for an invalid or expired recovery session', () => {
    mocks.auth.isPasswordRecovery = false;
    renderPage();
    expect(screen.getByText('লিংকটি কাজ করছে না')).toBeInTheDocument();
    expect(screen.queryByLabelText('নতুন পাসওয়ার্ড')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'লগইন পেজে যান' })).toHaveAttribute('href', '/login');
  });

  it('requires at least eight matching characters', async () => {
    renderPage();
    submitPasswords('short', 'short');
    expect(await screen.findByRole('alert')).toHaveTextContent('কমপক্ষে ৮ অক্ষরের');
    expect(mocks.completePasswordRecovery).not.toHaveBeenCalled();

    submitPasswords('new-password', 'different-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('দুইটি পাসওয়ার্ড মিলছে না');
    expect(mocks.completePasswordRecovery).not.toHaveBeenCalled();
  });

  it('completes recovery, ends the session through context, and returns to login', async () => {
    renderPage();
    submitPasswords('new-password', 'new-password');
    await waitFor(() => expect(mocks.completePasswordRecovery).toHaveBeenCalledWith('new-password'));
    expect(await screen.findByText('login destination')).toBeInTheDocument();
    expect(mocks.toastSuccess).toHaveBeenCalledWith('পাসওয়ার্ড পরিবর্তন হয়েছে। নতুন পাসওয়ার্ড দিয়ে লগইন করুন।');
  });

  it('shows an expired recovery error without navigating', async () => {
    mocks.completePasswordRecovery.mockRejectedValue(new Error('Recovery link expired'));
    renderPage();
    submitPasswords('new-password', 'new-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('লিংকটি সঠিক নয় অথবা এর মেয়াদ শেষ হয়েছে');
    expect(screen.queryByText('login destination')).not.toBeInTheDocument();
  });
});
