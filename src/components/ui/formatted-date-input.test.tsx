import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormattedDateInput } from './formatted-date-input';

describe('FormattedDateInput', () => {
  it('shows DD/MM/YYYY while retaining the ISO form value', () => {
    const onChange = vi.fn();
    render(<FormattedDateInput aria-label="তারিখ" value="2026-09-12" onChange={onChange} />);

    expect(screen.getByText('12/09/2026')).toBeInTheDocument();
    const input = screen.getByLabelText('তারিখ');
    expect(input).toHaveValue('2026-09-12');

    fireEvent.change(input, { target: { value: '2026-09-13' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('shows the expected placeholder when no date is selected', () => {
    render(<FormattedDateInput aria-label="তারিখ" value="" onChange={() => undefined} />);
    expect(screen.getByText('DD/MM/YYYY')).toBeInTheDocument();
  });
});
