import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Index from './Index';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  getProducts: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock('@/components/Navbar', () => ({ default: () => <nav>Navbar</nav> }));
vi.mock('@/components/Footer', () => ({ default: () => <footer>Footer</footer> }));
vi.mock('@/components/ProductCard', () => ({ default: () => <div>Product card</div> }));
vi.mock('@/contexts/PwaContext', () => ({
  usePwa: () => ({ canInstall: false, isInstalled: false, isOffline: false, install: vi.fn() }),
}));

describe('homepage critical loading', () => {
  it('prioritizes the hero and reserves the featured-product layout', () => {
    render(<MemoryRouter><Index /></MemoryRouter>);
    const hero = screen.getByRole('img', { name: 'নাফাহ এগ্রো' });
    expect(hero).toHaveAttribute('fetchpriority', 'high');
    expect(hero).toHaveAttribute('width', '1920');
    expect(hero).toHaveAttribute('height', '1080');
    expect(screen.getByLabelText('পণ্য লোড হচ্ছে')).toBeInTheDocument();
  });
});
