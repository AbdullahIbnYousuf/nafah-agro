import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

const mocks = vi.hoisted(() => ({ login: vi.fn() }));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ login: mocks.login }) }));
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
});
