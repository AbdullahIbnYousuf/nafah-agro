import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
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
    logout: vi.fn(),
    needsPasswordSetup: false,
  },
  getOwners: vi.fn(),
  getMyOrders: vi.fn(),
  inviteOwner: vi.fn(),
  promoteCustomerToOwner: vi.fn(),
  demoteOwnerToCustomer: vi.fn(),
  setOwnerActive: vi.fn(),
  deleteUnusedOwner: vi.fn(),
  pwa: {
    canInstall: true,
    isInstalled: false,
    isOffline: false,
    install: vi.fn(),
  },
  toastError: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/contexts/PwaContext', () => ({ usePwa: () => mocks.pwa }));
vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public code = 'TEST',
      public status = 400,
      public details: Record<string, unknown> = {},
    ) { super(message); }
  },
  customerPromotionCandidate: (error: { code?: string; details?: Record<string, unknown> }) => (
    error.code === 'CUSTOMER_EMAIL_EXISTS' ? error.details : null
  ),
  getOwners: mocks.getOwners,
  getMyOrders: mocks.getMyOrders,
  inviteOwner: mocks.inviteOwner,
  promoteCustomerToOwner: mocks.promoteCustomerToOwner,
  demoteOwnerToCustomer: mocks.demoteOwnerToCustomer,
  setOwnerActive: mocks.setOwnerActive,
  deleteUnusedOwner: mocks.deleteUnusedOwner,
}));
vi.mock('@/components/Navbar', () => ({ default: () => <nav>Navbar</nav> }));
vi.mock('@/components/Footer', () => ({ default: () => <footer>Footer</footer> }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

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
    mocks.auth.logout.mockResolvedValue(undefined);
    mocks.getOwners.mockResolvedValue({ owners: [], invitationsConfigured: true });
    mocks.getMyOrders.mockResolvedValue([]);
    mocks.deleteUnusedOwner.mockResolvedValue({ id: 'owner-2' });
    mocks.promoteCustomerToOwner.mockResolvedValue({});
    mocks.demoteOwnerToCustomer.mockResolvedValue({ id: 'owner-2', role: 'CUSTOMER' });
    mocks.pwa.canInstall = true;
    mocks.pwa.install.mockResolvedValue('accepted');
  });

  it('shows owner management and does not load customer orders for an OWNER', async () => {
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);
    expect(screen.getByText('পরিচালনা প্যানেল')).toBeInTheDocument();
    expect(await screen.findByText('ওনার অ্যাকাউন্ট')).toBeInTheDocument();
    expect(screen.getByText('নতুন ওনার আমন্ত্রণ')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'অ্যাপ ইনস্টল' })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'পরিবর্তন সেভ করুন' }));
    await waitFor(() => expect(mocks.auth.updateProfile).toHaveBeenCalledWith(
      'Updated Owner', '01800000000',
    ));
  });

  it('keeps normal password controls hidden until the secondary action is clicked', async () => {
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);

    expect(screen.queryByRole('heading', { name: 'নিরাপত্তা' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('বর্তমান পাসওয়ার্ড')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'পাসওয়ার্ড পরিবর্তন' }));
    expect(await screen.findByRole('dialog', { name: 'পাসওয়ার্ড পরিবর্তন' })).toBeInTheDocument();
    expect(screen.getByLabelText('বর্তমান পাসওয়ার্ড')).toBeInTheDocument();
    expect(screen.getByLabelText('নতুন পাসওয়ার্ড')).toBeInTheDocument();
  });

  it('replaces the normal profile with a mandatory invited-owner setup screen', async () => {
    mocks.auth.needsPasswordSetup = true;
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'অ্যাকাউন্ট চালু করতে পাসওয়ার্ড সেট করুন' })).toBeInTheDocument();
    expect(screen.getByText('স্বাগতম, Nafah Owner')).toBeInTheDocument();
    expect(screen.getByText('সেটআপ বাকি')).toBeInTheDocument();
    expect(screen.getByLabelText('নতুন পাসওয়ার্ড')).toBeInTheDocument();
    expect(screen.queryByLabelText('বর্তমান পাসওয়ার্ড')).not.toBeInTheDocument();
    expect(screen.queryByText('ব্যক্তিগত তথ্য')).not.toBeInTheDocument();
    expect(screen.queryByText('ওনার অ্যাকাউন্ট')).not.toBeInTheDocument();
    expect(screen.queryByText('নতুন ওনার আমন্ত্রণ')).not.toBeInTheDocument();
    expect(mocks.getOwners).not.toHaveBeenCalled();
  });

  it('shows invited-owner password validation and Supabase errors inline', async () => {
    mocks.auth.needsPasswordSetup = true;
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);
    const submit = screen.getByRole('button', { name: 'পাসওয়ার্ড সেট করে পরিচালনা প্যানেলে যান' });
    const form = submit.closest('form');
    if (!form) throw new Error('Owner setup form was not rendered.');

    fireEvent.change(screen.getByLabelText('নতুন পাসওয়ার্ড'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('নতুন পাসওয়ার্ড আবার লিখুন'), { target: { value: 'short' } });
    fireEvent.submit(form);
    expect(await screen.findByRole('alert')).toHaveTextContent('কমপক্ষে 8 অক্ষরের');

    fireEvent.change(screen.getByLabelText('নতুন পাসওয়ার্ড'), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByLabelText('নতুন পাসওয়ার্ড আবার লিখুন'), { target: { value: 'other-password' } });
    fireEvent.submit(form);
    expect(await screen.findByRole('alert')).toHaveTextContent('পাসওয়ার্ড দুইটি মিলছে না');

    mocks.auth.setInitialPassword.mockRejectedValueOnce(new Error('Supabase password update failed'));
    fireEvent.change(screen.getByLabelText('নতুন পাসওয়ার্ড আবার লিখুন'), { target: { value: 'new-password' } });
    fireEvent.submit(form);
    expect(await screen.findByRole('alert')).toHaveTextContent('Supabase password update failed');
  });

  it('sets the invited owner password and opens the owner dashboard', async () => {
    mocks.auth.needsPasswordSetup = true;
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<CustomerProfile />} />
          <Route path="/admin/dashboard" element={<div>owner dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('নতুন পাসওয়ার্ড'), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByLabelText('নতুন পাসওয়ার্ড আবার লিখুন'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'পাসওয়ার্ড সেট করে পরিচালনা প্যানেলে যান' }));

    await waitFor(() => expect(mocks.auth.setInitialPassword).toHaveBeenCalledWith('new-password'));
    expect(await screen.findByText('owner dashboard')).toBeInTheDocument();
  });

  it('allows an invited owner to log out without completing setup', async () => {
    mocks.auth.needsPasswordSetup = true;
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<CustomerProfile />} />
          <Route path="/login" element={<div>login destination</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'লগআউট' }));
    await waitFor(() => expect(mocks.auth.logout).toHaveBeenCalledOnce());
    expect(await screen.findByText('login destination')).toBeInTheDocument();
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

  it('offers promotion for an existing customer and closing the dialog does nothing', async () => {
    mocks.inviteOwner.mockRejectedValue(new ApiError(
      'Customer exists',
      'CUSTOMER_EMAIL_EXISTS',
      409,
      {
        customerProfileId: 'customer-1',
        fullName: 'Existing Customer',
        phoneNumber: '01600000000',
        email: 'customer@example.com',
        isActive: true,
      },
    ));
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);

    await screen.findByText('নতুন ওনার আমন্ত্রণ');
    fireEvent.change(screen.getByLabelText('পুরো নাম', { selector: '#owner-name' }), {
      target: { value: 'Form Name' },
    });
    fireEvent.change(screen.getByLabelText('ফোন নম্বর', { selector: '#owner-phone' }), {
      target: { value: '01800000000' },
    });
    fireEvent.change(screen.getByLabelText('ইমেইল', { selector: '#owner-email' }), {
      target: { value: 'customer@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'আমন্ত্রণ পাঠান' }));

    expect(await screen.findByRole('dialog', { name: 'এই কাস্টমারকে ওনার করবেন?' })).toBeInTheDocument();
    expect(screen.getByText('Existing Customer')).toBeInTheDocument();
    expect(screen.getByText('01600000000')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'বাতিল' }));
    expect(mocks.promoteCustomerToOwner).not.toHaveBeenCalled();
  });

  it('promotes an existing customer only after a required reason', async () => {
    mocks.inviteOwner.mockRejectedValue(new ApiError(
      'Customer exists',
      'CUSTOMER_EMAIL_EXISTS',
      409,
      {
        customerProfileId: 'customer-1',
        fullName: 'Existing Customer',
        phoneNumber: '01600000000',
        email: 'customer@example.com',
        isActive: true,
      },
    ));
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);

    await screen.findByText('নতুন ওনার আমন্ত্রণ');
    fireEvent.change(screen.getByLabelText('পুরো নাম', { selector: '#owner-name' }), { target: { value: 'Form Name' } });
    fireEvent.change(screen.getByLabelText('ফোন নম্বর', { selector: '#owner-phone' }), { target: { value: '01800000000' } });
    fireEvent.change(screen.getByLabelText('ইমেইল', { selector: '#owner-email' }), { target: { value: 'customer@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'আমন্ত্রণ পাঠান' }));

    const promoteButton = await screen.findByRole('button', { name: 'ওনার করুন' });
    expect(promoteButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('ওনার করার কারণ'), { target: { value: 'Shop management access' } });
    fireEvent.click(promoteButton);
    await waitFor(() => expect(mocks.promoteCustomerToOwner).toHaveBeenCalledWith({
      customerProfileId: 'customer-1',
      reason: 'Shop management access',
    }));
  });

  it('keeps promotion API errors inside the confirmation dialog', async () => {
    mocks.inviteOwner.mockRejectedValue(new ApiError(
      'Customer exists',
      'CUSTOMER_EMAIL_EXISTS',
      409,
      {
        customerProfileId: 'customer-1',
        fullName: 'Existing Customer',
        phoneNumber: '01600000000',
        email: 'customer@example.com',
        isActive: true,
      },
    ));
    mocks.promoteCustomerToOwner.mockRejectedValueOnce(new Error('Role changed before confirmation'));
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);

    await screen.findByText('নতুন ওনার আমন্ত্রণ');
    fireEvent.change(screen.getByLabelText('পুরো নাম', { selector: '#owner-name' }), { target: { value: 'Form Name' } });
    fireEvent.change(screen.getByLabelText('ফোন নম্বর', { selector: '#owner-phone' }), { target: { value: '01800000000' } });
    fireEvent.change(screen.getByLabelText('ইমেইল', { selector: '#owner-email' }), { target: { value: 'customer@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'আমন্ত্রণ পাঠান' }));
    fireEvent.change(await screen.findByLabelText('ওনার করার কারণ'), { target: { value: 'Shop access' } });
    fireEvent.click(screen.getByRole('button', { name: 'ওনার করুন' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Role changed before confirmation');
    expect(screen.getByRole('dialog', { name: 'এই কাস্টমারকে ওনার করবেন?' })).toBeInTheDocument();
  });

  it('shows eligible promoted owners and demotes only after confirmation', async () => {
    mocks.getOwners.mockResolvedValue({
      invitationsConfigured: true,
      owners: [{
        id: 'owner-2', role: 'OWNER', fullName: 'Promoted Owner', phoneNumber: '01800000000',
        email: 'promoted@example.com', isActive: true, invitedAt: null,
        lastSignInAt: '2026-08-03T00:00:00Z', createdAt: '2026-08-02T00:00:00Z',
        canDelete: false, promotedFromCustomer: true, canDemote: true, demotionBlockedReason: null,
      }],
    });
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);

    expect(await screen.findByText('কাস্টমার থেকে ওনার')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'কাস্টমার করুন' }));
    expect(screen.getByRole('dialog', { name: 'আবার কাস্টমার করবেন?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'বাতিল' }));
    expect(mocks.demoteOwnerToCustomer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'কাস্টমার করুন' }));
    fireEvent.change(screen.getByLabelText('কাস্টমার করার কারণ'), { target: { value: 'No longer manages shop' } });
    fireEvent.click(screen.getByRole('button', { name: 'কাস্টমার করুন' }));
    await waitFor(() => expect(mocks.demoteOwnerToCustomer).toHaveBeenCalledWith(
      'owner-2',
      { reason: 'No longer manages shop' },
    ));
  });

  it('explains unavailable owner invitations from both the warning and button', async () => {
    mocks.getOwners.mockResolvedValue({ owners: [], invitationsConfigured: false });
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);

    expect(await screen.findByText(/ওনার আমন্ত্রণ এখনো চালু করা হয়নি/)).toBeInTheDocument();
    const inviteButton = screen.getByRole('button', { name: 'আমন্ত্রণ পাঠান' });
    expect(inviteButton).toHaveAttribute('aria-disabled', 'true');
    expect(inviteButton).not.toBeDisabled();
    expect(screen.getByLabelText('ইমেইল', { selector: '#owner-email' })).toBeDisabled();
    fireEvent.click(inviteButton);
    expect(mocks.toastError).toHaveBeenCalledWith('ওনার আমন্ত্রণ এখনো চালু করা হয়নি। সেটআপ সম্পন্ন করতে ডেভেলপারের সাথে যোগাযোগ করুন।');
    expect(mocks.inviteOwner).not.toHaveBeenCalled();
  });

  it('deletes a signed-in but unused owner only after explicit confirmation', async () => {
    mocks.getOwners.mockResolvedValue({
      invitationsConfigured: true,
      owners: [
        { id: 'owner-1', role: 'OWNER', fullName: 'Current Owner', phoneNumber: '01700000000', email: 'owner@example.com', isActive: true, invitedAt: null, lastSignInAt: '2026-08-01T00:00:00Z', createdAt: '2026-08-01T00:00:00Z', canDelete: false, promotedFromCustomer: false, canDemote: false, demotionBlockedReason: null },
        { id: 'owner-2', role: 'OWNER', fullName: 'Signed-in Owner', phoneNumber: '01800000000', email: 'unused@example.com', isActive: true, invitedAt: '2026-08-02T00:00:00Z', lastSignInAt: '2026-08-03T00:00:00Z', createdAt: '2026-08-02T00:00:00Z', canDelete: true, promotedFromCustomer: false, canDemote: false, demotionBlockedReason: null },
      ],
    });
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'অ্যাকাউন্ট ডিলিট করুন' }));
    expect(screen.getByRole('dialog', { name: 'ব্যবহার হয়নি এমন ওনার অ্যাকাউন্ট ডিলিট করুন' })).toBeInTheDocument();
    expect(mocks.deleteUnusedOwner).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'বাতিল' }));
    expect(mocks.deleteUnusedOwner).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'অ্যাকাউন্ট ডিলিট করুন' }));
    fireEvent.click(screen.getByRole('button', { name: 'ডিলিট করুন' }));
    await waitFor(() => expect(mocks.deleteUnusedOwner).toHaveBeenCalledWith('owner-2'));
  });

  it('explains why an owner account cannot be deleted or demoted', async () => {
    mocks.getOwners.mockResolvedValue({
      invitationsConfigured: true,
      owners: [{
        id: 'owner-2', role: 'OWNER', fullName: 'Working Owner', phoneNumber: '01800000000',
        email: 'working@example.com', isActive: true, invitedAt: null,
        lastSignInAt: '2026-08-03T00:00:00Z', createdAt: '2026-08-02T00:00:00Z',
        canDelete: false, promotedFromCustomer: true, canDemote: false, demotionBlockedReason: 'OWNER_HISTORY',
      }],
    });
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'কাস্টমার করুন' }));
    expect(mocks.toastError).toHaveBeenCalledWith('পরিচালনার কাজ করেছেন, তাই এখন আর কাস্টমার করা যাবে না।');
    fireEvent.click(screen.getByRole('button', { name: 'অ্যাকাউন্ট ডিলিট করুন' }));
    expect(mocks.toastError).toHaveBeenCalledWith('এই অ্যাকাউন্টটি আগে কাস্টমার ছিল। ডিলিট না করে কাস্টমার করুন।');
    expect(mocks.deleteUnusedOwner).not.toHaveBeenCalled();
  });

  it('shows order history and hides owner controls for a CUSTOMER', async () => {
    mocks.auth.user = { ...mocks.auth.user, role: 'CUSTOMER' as const, name: 'Nafah Customer' };
    mocks.auth.isOwner = false;
    render(<MemoryRouter><CustomerProfile /></MemoryRouter>);
    expect(await screen.findByText('আমার ওয়েবসাইট অর্ডার')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'অ্যাপ ইনস্টল' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.getMyOrders).toHaveBeenCalledOnce());
    expect(screen.queryByText('নতুন ওনার আমন্ত্রণ')).not.toBeInTheDocument();
    expect(mocks.getOwners).not.toHaveBeenCalled();
  });
});
