import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

const mocks = vi.hoisted(() => ({ login: vi.fn(), requestPasswordReset: vi.fn() }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ login: mocks.login, requestPasswordReset: mocks.requestPasswordReset }),
}));
vi.mock('@/components/Navbar', () => ({ default: () => <nav>Navbar</nav> }));
vi.mock('@/components/Footer', () => ({ default: () => <footer>Footer</footer> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function submitLogin() {
  fireEvent.change(screen.getByLabelText('ইমেইল'), { target: { value: 'owner@example.com' } });
  fireEvent.change(screen.getByLabelText('পাসওয়ার্ড'), { target: { value: 'password' } });
  fireEvent.click(screen.getByRole('button', { name: 'লগইন করুন' }));
}

describe('login routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.login.mockResolvedValue({ role: 'OWNER' });
    mocks.requestPasswordReset.mockResolvedValue(undefined);
  });

  it('returns a successful login to the requested protected route', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/admin/orders' } }]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin/orders" element={<div>requested orders</div>} />
        </Routes>
      </MemoryRouter>,
    );
    submitLogin();
    expect(await screen.findByText('requested orders')).toBeInTheDocument();
  });

  it('rejects an external return target and uses the role landing page', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '//malicious.example' } }]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin/dashboard" element={<div>owner dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );
    submitLogin();
    await waitFor(() => expect(screen.getByText('owner dashboard')).toBeInTheDocument());
  });

  it('prefills the recovery dialog and shows a non-disclosing confirmation', async () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('ইমেইল'), { target: { value: 'customer@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'পাসওয়ার্ড ভুলে গেছেন?' }));

    const dialog = await screen.findByRole('dialog', { name: 'পাসওয়ার্ড পরিবর্তনের লিংক' });
    const recoveryEmail = within(dialog).getByLabelText('ইমেইল');
    expect(recoveryEmail).toHaveValue('customer@example.com');
    fireEvent.click(within(dialog).getByRole('button', { name: 'লিংক পাঠান' }));

    await waitFor(() => expect(mocks.requestPasswordReset).toHaveBeenCalledWith('customer@example.com'));
    expect(within(dialog).getByRole('status')).toHaveTextContent('এই ইমেইলে অ্যাকাউন্ট থাকলে');
    expect(within(dialog).getByRole('button', { name: 'আবার পাঠাতে 60 সেকেন্ড' })).toBeDisabled();
  });

  it('shows a clear rate-limit error inside the recovery dialog', async () => {
    mocks.requestPasswordReset.mockRejectedValue(new Error('Email rate limit exceeded'));
    render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'পাসওয়ার্ড ভুলে গেছেন?' }));
    const dialog = await screen.findByRole('dialog', { name: 'পাসওয়ার্ড পরিবর্তনের লিংক' });
    fireEvent.change(within(dialog).getByLabelText('ইমেইল'), { target: { value: 'owner@example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'লিংক পাঠান' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('অনেকবার চেষ্টা করা হয়েছে');
  });

  it('does not reveal when Supabase reports that an email is unknown', async () => {
    mocks.requestPasswordReset.mockRejectedValue(new Error('User not found'));
    render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'পাসওয়ার্ড ভুলে গেছেন?' }));
    const dialog = await screen.findByRole('dialog', { name: 'পাসওয়ার্ড পরিবর্তনের লিংক' });
    fireEvent.change(within(dialog).getByLabelText('ইমেইল'), { target: { value: 'unknown@example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'লিংক পাঠান' }));
    expect(await within(dialog).findByRole('status')).toHaveTextContent('এই ইমেইলে অ্যাকাউন্ট থাকলে');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });
});
