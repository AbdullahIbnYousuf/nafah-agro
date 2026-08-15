// @vitest-environment node

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'prisma/migrations/202608040002_milestone_6_integrity/migration.sql';
const triggerFixMigrationPath =
  'prisma/migrations/202608080001_fix_stock_integrity_trigger/migration.sql';
const looseProductsMigrationPath =
  'prisma/migrations/202608150001_loose_products/migration.sql';
const measuredSaleConstraintMigrationPath =
  'prisma/migrations/202608150002_measured_sale_values_constraint/migration.sql';
const measuredAllocationConstraintMigrationPath =
  'prisma/migrations/202608150003_measured_allocation_values_constraint/migration.sql';

describe('Milestone 6 integrity safeguards', () => {
  it('validates cached variant stock totals at transaction commit', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('validate_variant_stock_totals');
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(migration).toContain('Variant cached stock totals do not match stock batches');
  });

  it('resolves each stock-integrity trigger row using only columns from its table', () => {
    const migration = readFileSync(triggerFixMigrationPath, 'utf8');

    expect(migration).toContain("IF TG_TABLE_NAME = 'product_variants' THEN");
    expect(migration).toContain("ELSIF TG_TABLE_NAME = 'stock_batches' THEN");
    expect(migration).toContain("IF TG_OP = 'DELETE' THEN");
    expect(migration).not.toMatch(/variant_id\s*:=\s*CASE/);
  });

  it('uses a deployment-safe Supabase connection for Prisma CLI migrations', () => {
    const config = readFileSync('prisma.config.ts', 'utf8');

    expect(config).toContain('url.hostname.endsWith(".supabase.com")');
    expect(config).toContain('url.searchParams.set("sslmode", "require")');
    expect(config).toContain('url.searchParams.set("connect_timeout", "30")');
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

  it('adds loose-product units without rewriting existing product or order quantities', () => {
    const migration = readFileSync(looseProductsMigrationPath, 'utf8');

    expect(migration).toContain("'PACKAGED', 'LOOSE_WEIGHT', 'LOOSE_VOLUME'");
    expect(migration).toContain('"kind" "ProductKind" NOT NULL DEFAULT \'PACKAGED\'');
    expect(migration).toContain('"quantity_unit" "QuantityUnit" NOT NULL DEFAULT \'PIECE\'');
    expect(migration).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/i);
  });

  it('validates measured sale revenue using per-kilogram and per-litre rates', () => {
    const migration = readFileSync(measuredSaleConstraintMigrationPath, 'utf8');

    expect(migration).toContain('DROP CONSTRAINT "sales_order_items_values_valid"');
    expect(migration).toContain("WHEN \"quantity_unit\" = 'PIECE'");
    expect(migration).toContain('round(("unit_selling_price" * "quantity") / 1000, 2)');
    expect(migration).not.toContain("ADD VALUE 'FAILED_DELIVERY'");
  });

  it('accepts exact piece or scaled measured FIFO allocation costs', () => {
    const migration = readFileSync(measuredAllocationConstraintMigrationPath, 'utf8');

    expect(migration).toContain('DROP CONSTRAINT "order_allocations_values_valid"');
    expect(migration).toContain('"total_buying_cost" = "unit_buying_cost" * "quantity"');
    expect(migration).toContain('round(("unit_buying_cost" * "quantity") / 1000, 2)');
  });

  it('refreshes only known demo-order dates for dashboard demonstrations', () => {
    const seed = readFileSync('prisma/seed-dashboard-demo.ts', 'utf8');
    expect(seed).toContain('CONFIRM_DASHBOARD_DEMO');
    expect(seed).toContain('PHY-DEMO-1001');
    expect(seed).toContain('PHY-DEMO-1002');
    expect(seed).toContain('WEB-DEMO-1003');
    expect(seed).not.toMatch(/TRUNCATE/i);
    expect(seed).not.toMatch(
      /(?:salesOrder|orderAllocation)\.(?:create|createMany|delete|deleteMany)/,
    );
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

  it('keeps em dashes out of frontend source', () => {
    const frontendFiles = readdirSync('src', { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:ts|tsx|css|html)$/.test(entry.name));
    const sources = frontendFiles.map((entry) =>
      readFileSync(`${entry.parentPath}/${entry.name}`, 'utf8'),
    ).join('\n');
    expect(sources).not.toContain('—');
  });
});
