import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Navbar from './Navbar';

const mocks = vi.hoisted(() => ({
  auth: {
    user: {
      id: 'owner-1', name: 'Invited Owner', email: 'invited@example.com',
      phoneNumber: '01700000000', role: 'OWNER' as const, isActive: true,
    },
    isAuthenticated: true,
    isOwner: true,
    needsPasswordSetup: false,
    logout: vi.fn(),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/contexts/CartContext', () => ({ useCart: () => ({ totalItems: 2 }) }));

describe('navbar invited-owner setup state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.needsPasswordSetup = false;
    mocks.auth.logout.mockResolvedValue(undefined);
  });

  it('keeps the normal owner navigation after account setup', () => {
    render(<MemoryRouter><Navbar /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'মেনু খুলুন' }));
    expect(screen.getAllByText('পরিচালনা প্যানেল').length).toBeGreaterThan(0);
    expect(screen.getAllByText('হোম').length).toBeGreaterThan(0);
    expect(screen.queryByText('সেটআপ বাকি')).not.toBeInTheDocument();
  });

  it('shows only setup status and logout while an invited owner is pending', () => {
    mocks.auth.needsPasswordSetup = true;
    render(<MemoryRouter><Navbar /></MemoryRouter>);

    expect(screen.getByText('সেটআপ বাকি')).toBeInTheDocument();
    expect(screen.queryByText('হোম')).not.toBeInTheDocument();
    expect(screen.queryByText('দোকান')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('কার্ট')).not.toBeInTheDocument();
    expect(screen.queryByText('পরিচালনা প্যানেল')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'লগআউট' }));
    expect(mocks.auth.logout).toHaveBeenCalledOnce();
  });
});
