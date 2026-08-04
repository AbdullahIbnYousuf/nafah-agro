import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/lib/types';
import CustomerProfile from './CustomerProfile';

const mocks = vi.hoisted(() => ({
  auth: {
    user: {
      id: 'owner-1', name: 'Nafah Owner', email: 'owner@example.com',
      phoneNumber: '01700000000', role: 'OWNER' as const, isActive: true,
    } as User,
    isOwner: true,
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    setInitialPassword: vi.fn(),
    needsPasswordSetup: false,
  },
  getOwners: vi.fn(),
  getMyOrders: vi.fn(),
  inviteOwner: vi.fn(),
  setOwnerActive: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error { code = 'TEST'; },
  getOwners: mocks.getOwners,
  getMyOrders: mocks.getMyOrders,
  inviteOwner: mocks.inviteOwner,
  setOwnerActive: mocks.setOwnerActive,
}));
vi.mock('@/components/Navbar', () => ({ default: () => <nav>Navbar</nav> }));
vi.mock('@/components/Footer', () => ({ default: () => <footer>Footer</footer> }));

describe('role-aware profile page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.user = {
      id: 'owner-1', name: 'Nafah Owner', email: 'owner@example.com',
      phoneNumber: '01700000000', role: 'OWNER', isActive: true,
    };
    mocks.auth.isOwner = true;
    mocks.getOwners.mockResolvedValue({ owners: [], invitationsConfigured: true });
    mocks.getMyOrders.mockResolvedValue([]);
  });

  it('shows owner management and does not load customer orders for an OWNER', async () => {
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);
    expect(screen.getByText('পরিচালনা প্যানেল')).toBeInTheDocument();
    expect(await screen.findByText('ওনার অ্যাকাউন্ট')).toBeInTheDocument();
    expect(screen.getByText('নতুন ওনার আমন্ত্রণ')).toBeInTheDocument();
    expect(mocks.getOwners).toHaveBeenCalledOnce();
    expect(mocks.getMyOrders).not.toHaveBeenCalled();
  });

  it('shows order history and hides owner controls for a CUSTOMER', async () => {
    mocks.auth.user = { ...mocks.auth.user, role: 'CUSTOMER' as const, name: 'Nafah Customer' };
    mocks.auth.isOwner = false;
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);
    expect(await screen.findByText('আমার ওয়েবসাইট অর্ডার')).toBeInTheDocument();
    await waitFor(() => expect(mocks.getMyOrders).toHaveBeenCalledOnce());
    expect(screen.queryByText('নতুন ওনার আমন্ত্রণ')).not.toBeInTheDocument();
    expect(mocks.getOwners).not.toHaveBeenCalled();
  });
});
