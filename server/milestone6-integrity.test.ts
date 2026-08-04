// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'prisma/migrations/202608040002_milestone_6_integrity/migration.sql';

describe('Milestone 6 integrity safeguards', () => {
  it('validates cached variant stock totals at transaction commit', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('validate_variant_stock_totals');
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(migration).toContain('Variant cached stock totals do not match stock batches');
  });

  it('requires consistent allocation timestamps and order reasons', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('order_allocations_state_timestamps_valid');
    expect(migration).toContain('sales_orders_status_reason_required');
    expect(migration).toContain("status <> 'CANCELLED'");
    expect(migration).not.toContain("status NOT IN ('CANCELLED', 'FAILED_DELIVERY')");
    expect(migration).toContain('sales_orders_return_reason_required');
  });

  it('prevents a stock batch from being reassigned to another variant', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('stock_batches_variant_immutable');
    expect(migration).toContain('prevent_stock_batch_variant_change');
  });

  it('keeps the normal seed non-destructive and idempotent', () => {
    const seed = readFileSync('prisma/seed.ts', 'utf8');
    expect(seed).toContain('foundationRecord.upsert');
    expect(seed).not.toMatch(/deleteMany|TRUNCATE|\$executeRawUnsafe/);
  });

  it('keeps important management workflows free of browser-native dialogs', () => {
    const sources = [
      'src/pages/Admin.tsx',
      'src/components/PhysicalSaleScreen.tsx',
      'src/components/UnifiedOrderManager.tsx',
      'src/components/ReturnOrderDialog.tsx',
    ].map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(sources).not.toMatch(/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
  });
});
