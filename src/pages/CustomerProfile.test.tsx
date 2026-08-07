import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    mocks.auth.needsPasswordSetup = false;
    mocks.auth.updateProfile.mockResolvedValue(undefined);
    mocks.auth.changePassword.mockResolvedValue(undefined);
    mocks.auth.setInitialPassword.mockResolvedValue(undefined);
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

  it('keeps personal information read-only until the edit dialog is opened', async () => {
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);

    expect(screen.queryByLabelText('পুরো নাম', { selector: '#profile-name' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /সম্পাদনা/ }));
    expect(await screen.findByRole('dialog', { name: 'ব্যক্তিগত তথ্য সম্পাদনা' })).toBeInTheDocument();
    const name = screen.getByLabelText('পুরো নাম', { selector: '#profile-name' });
    const phone = screen.getByLabelText('ফোন নম্বর', { selector: '#profile-phone' });
    expect(name).toHaveValue('Nafah Owner');
    expect(phone).toHaveValue('01700000000');

    fireEvent.change(name, { target: { value: 'Updated Owner' } });
    fireEvent.change(phone, { target: { value: '01800000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'পরিবর্তন সংরক্ষণ করুন' }));
    await waitFor(() => expect(mocks.auth.updateProfile).toHaveBeenCalledWith(
      'Updated Owner', '01800000000',
    ));
  });

  it('keeps normal password controls hidden until the secondary action is clicked', async () => {
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);

    expect(screen.queryByLabelText('বর্তমান পাসওয়ার্ড')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'পাসওয়ার্ড পরিবর্তন' }));
    expect(await screen.findByRole('dialog', { name: 'পাসওয়ার্ড পরিবর্তন' })).toBeInTheDocument();
    expect(screen.getByLabelText('বর্তমান পাসওয়ার্ড')).toBeInTheDocument();
    expect(screen.getByLabelText('নতুন পাসওয়ার্ড')).toBeInTheDocument();
  });

  it('keeps initial password setup visible for an invited owner', async () => {
    mocks.auth.needsPasswordSetup = true;
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);

    expect(screen.getByText(/আমন্ত্রণ গ্রহণ সম্পন্ন করতে/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'পাসওয়ার্ড সেট করুন' }));
    expect(await screen.findByRole('dialog', { name: 'নিজের পাসওয়ার্ড সেট করুন' })).toBeInTheDocument();
    expect(screen.queryByLabelText('বর্তমান পাসওয়ার্ড')).not.toBeInTheDocument();
  });

  it('submits a configured owner invitation with the required profile data', async () => {
    mocks.inviteOwner.mockResolvedValue({});
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);

    await screen.findByText('নতুন ওনার আমন্ত্রণ');
    fireEvent.change(screen.getByLabelText('পুরো নাম', { selector: '#owner-name' }), {
      target: { value: 'Second Owner' },
    });
    fireEvent.change(screen.getByLabelText('ফোন নম্বর', { selector: '#owner-phone' }), {
      target: { value: '01800000000' },
    });
    fireEvent.change(screen.getByLabelText('ইমেইল', { selector: '#owner-email' }), {
      target: { value: 'second@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'আমন্ত্রণ পাঠান' }));

    await waitFor(() => expect(mocks.inviteOwner).toHaveBeenCalledWith({
      fullName: 'Second Owner',
      phoneNumber: '01800000000',
      email: 'second@example.com',
    }));
  });

  it('clearly disables invitation fields when backend administration is unavailable', async () => {
    mocks.getOwners.mockResolvedValue({ owners: [], invitationsConfigured: false });
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);

    expect(await screen.findByText(/ওনার আমন্ত্রণ এখনো চালু করা হয়নি/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'আমন্ত্রণ পাঠান' })).toBeDisabled();
    expect(screen.getByLabelText('ইমেইল', { selector: '#owner-email' })).toBeDisabled();
    expect(mocks.inviteOwner).not.toHaveBeenCalled();
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
