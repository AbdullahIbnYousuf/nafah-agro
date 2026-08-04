import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './api';

describe('API error presentation', () => {
  it('turns Zod issue details into a useful field-level message', () => {
    expect(apiErrorMessage({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: { issues: [{ path: ['customer', 'phone'], message: 'Phone is required' }] },
      },
    }, 400)).toBe('customer.phone: Phone is required');
  });

  it('falls back to the safe API message', () => {
    expect(apiErrorMessage({ error: { message: 'Insufficient stock' } }, 409)).toBe('Insufficient stock');
  });
});
