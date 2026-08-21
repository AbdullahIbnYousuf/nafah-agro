import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { InvitePasswordRedirect } from './App';

const authState = vi.hoisted(() => ({ needsPasswordSetup: true }));

vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>('@/contexts/AuthContext');
  return { ...actual, useAuth: () => authState };
});

describe('invited owner route precedence', () => {
  it('does not intercept the Supabase password-recovery route', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <InvitePasswordRedirect />
        <Routes>
          <Route path="/reset-password" element={<div>recovery page</div>} />
          <Route path="/profile" element={<div>profile page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('recovery page')).toBeInTheDocument();
  });

  it('continues directing invited owners to profile from other pages', () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <InvitePasswordRedirect />
        <Routes>
          <Route path="/admin/dashboard" element={<div>dashboard page</div>} />
          <Route path="/profile" element={<div>profile page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('profile page')).toBeInTheDocument();
  });
});
