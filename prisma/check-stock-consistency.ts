import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../server/generated/prisma/client.js";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL is required");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

interface StockMismatch {
  id: string;
  productName: string;
  sku: string;
  cachedAvailable: number;
  batchAvailable: number;
  cachedReserved: number;
  batchReserved: number;
}

try {
  const mismatches = await prisma.$queryRaw<StockMismatch[]>`
    SELECT
      pv.id,
      p.name AS "productName",
      pv.sku,
      pv.available_stock AS "cachedAvailable",
      COALESCE(SUM(sb.available_quantity), 0)::integer AS "batchAvailable",
      pv.reserved_stock AS "cachedReserved",
      COALESCE(SUM(sb.reserved_quantity), 0)::integer AS "batchReserved"
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN stock_batches sb ON sb.product_variant_id = pv.id
    GROUP BY pv.id, p.name, pv.sku, pv.available_stock, pv.reserved_stock
    HAVING pv.available_stock <> COALESCE(SUM(sb.available_quantity), 0)
       OR pv.reserved_stock <> COALESCE(SUM(sb.reserved_quantity), 0)
    ORDER BY p.name, pv.sku
  `;

  if (mismatches.length > 0) {
    console.error(JSON.stringify({ consistent: false, mismatches }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ consistent: true, mismatches: [] }));
  }
} finally {
  await prisma.$disconnect();
}
