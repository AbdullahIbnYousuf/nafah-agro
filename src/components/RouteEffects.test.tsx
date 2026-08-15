import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { titleForPath } from '@/lib/routeTitles';
import RouteEffects from './RouteEffects';

describe('route presentation effects', () => {
  afterEach(() => vi.restoreAllMocks());

  it('provides meaningful titles for public and nested admin pages', () => {
    expect(titleForPath('/')).toBe('হোম | নাফাহ এগ্রো');
    expect(titleForPath('/admin/products/new')).toBe('নতুন পণ্য | নাফাহ এগ্রো');
    expect(titleForPath('/admin/orders')).toBe('অর্ডার | নাফাহ এগ্রো');
    expect(titleForPath('/missing')).toBe('পৃষ্ঠা পাওয়া যায়নি | নাফাহ এগ্রো');
  });

  it('sets the browser title and scrolls to the top after routing', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(<MemoryRouter initialEntries={['/shop']}><RouteEffects /></MemoryRouter>);
    await waitFor(() => expect(document.title).toBe('দোকান | নাফাহ এগ্রো'));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });
});
