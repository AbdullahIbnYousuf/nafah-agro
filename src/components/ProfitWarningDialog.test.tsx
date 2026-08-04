import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProfitWarningDialog from './ProfitWarningDialog';

describe('unprofitable sale dialog', () => {
  it('does nothing when closed and requires explicit confirmation', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn(async () => {});
    const { rerender } = render(<ProfitWarningDialog open projectedGrossProfit="-50.00" onClose={onClose} onConfirm={onConfirm} />);
    expect(screen.getByText(/৳-50.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'বন্ধ করুন' }));
    expect(onConfirm).not.toHaveBeenCalled();

    rerender(<ProfitWarningDialog open projectedGrossProfit="-50.00" onClose={onClose} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'ক্ষতি মেনে চালিয়ে যান' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
  });

  it('shows submission errors inside the dialog', async () => {
    render(<ProfitWarningDialog open onClose={vi.fn()} onConfirm={vi.fn(async () => { throw new Error('Stock changed'); })} />);
    fireEvent.click(screen.getByRole('button', { name: 'ক্ষতি মেনে চালিয়ে যান' }));
    expect(await screen.findByText('Stock changed')).toBeInTheDocument();
  });
});
