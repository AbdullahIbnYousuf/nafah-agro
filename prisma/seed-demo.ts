import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../server/generated/prisma/client.js";

const RESET_CONFIRMATION = "RESET_NAFAH_AGRO_DEMO";
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (process.env.CONFIRM_DEMO_RESET !== RESET_CONFIRMATION) {
  throw new Error(
    `Demo reset is destructive. Set CONFIRM_DEMO_RESET=${RESET_CONFIRMATION} to continue.`,
  );
}

if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL is required to seed demo data");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const image = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=85`;

const products = [
  {
    category: "rice-grains",
    name: "Premium Miniket Rice",
    slug: "premium-miniket-rice",
    description:
      "Clean, carefully selected Miniket rice with slender grains and a soft texture for everyday family meals.",
    featured: true,
    tags: ["rice", "staple", "family"],
    images: [image("photo-1586201375761-83865001e31c")],
    attributes: [{
      name: "Weight",
      options: [
        { label: "5 kg", value: "5-kg", priceModifier: 0 },
        { label: "10 kg", value: "10-kg", priceModifier: 560 },
      ],
    }],
    variants: [
      { name: "5 kg", sku: "NA-RICE-MINI-5KG", price: 620, cost: 480, quantity: 30, isDefault: true },
      { name: "10 kg", sku: "NA-RICE-MINI-10KG", price: 1180, cost: 920, quantity: 20 },
    ],
  },
  {
    category: "rice-grains",
    name: "Aromatic Chinigura Rice",
    slug: "aromatic-chinigura-rice",
    description:
      "Naturally aromatic fine rice, ideal for polao, biryani, khichuri, and festive dishes.",
    featured: true,
    tags: ["rice", "aromatic", "polao"],
    images: [image("photo-1536304993881-ff6e9eefa2a6")],
    attributes: [],
    variants: [
      { name: "Default", sku: "NA-RICE-CHINI-1KG", price: 220, cost: 150, quantity: 40, isDefault: true },
    ],
  },
  {
    category: "oils-essentials",
    name: "Cold-Pressed Mustard Oil",
    slug: "cold-pressed-mustard-oil",
    description:
      "Traditional cold-pressed mustard oil with a rich aroma, produced without artificial colours or flavours.",
    featured: true,
    tags: ["oil", "cold-pressed", "mustard"],
    images: [image("photo-1474979266404-7eaacbcd87c5")],
    attributes: [{
      name: "Volume",
      options: [
        { label: "1 litre", value: "1-litre", priceModifier: 0 },
        { label: "5 litres", value: "5-litres", priceModifier: 1370 },
      ],
    }],
    variants: [
      { name: "1 litre", sku: "NA-OIL-MUSTARD-1L", price: 380, cost: 270, quantity: 35, isDefault: true },
      { name: "5 litres", sku: "NA-OIL-MUSTARD-5L", price: 1750, cost: 1280, quantity: 12 },
    ],
  },
  {
    category: "natural-foods",
    name: "Sundarbans Raw Honey",
    slug: "sundarbans-raw-honey",
    description:
      "Raw honey collected from the Sundarbans region, gently filtered to retain its natural flavour and character.",
    featured: true,
    tags: ["honey", "natural", "sundarbans"],
    images: [image("photo-1587049352846-4a222e784d38")],
    attributes: [{
      name: "Weight",
      options: [
        { label: "500 g", value: "500-g", priceModifier: 0 },
        { label: "1 kg", value: "1-kg", priceModifier: 430 },
      ],
    }],
    variants: [
      { name: "500 g", sku: "NA-HONEY-RAW-500G", price: 520, cost: 360, quantity: 30, isDefault: true },
      { name: "1 kg", sku: "NA-HONEY-RAW-1KG", price: 950, cost: 680, quantity: 18 },
    ],
  },
  {
    category: "natural-foods",
    name: "Pure Cow Ghee",
    slug: "pure-cow-ghee",
    description:
      "Small-batch cow ghee with a deep, nutty aroma for rice, desserts, and traditional cooking.",
    featured: true,
    tags: ["ghee", "dairy", "traditional"],
    images: [image("photo-1628088062854-d1870b4553da")],
    attributes: [],
    variants: [
      { name: "Default", sku: "NA-GHEE-COW-500G", price: 780, cost: 600, quantity: 20, isDefault: true },
    ],
  },
  {
    category: "rice-grains",
    name: "Premium Red Lentils",
    slug: "premium-red-lentils",
    description:
      "Clean and evenly graded masoor dal that cooks quickly into a smooth, comforting everyday dish.",
    featured: false,
    tags: ["dal", "lentils", "protein"],
    images: [image("photo-1708436477916-f97964f3ccf1")],
    attributes: [],
    variants: [
      { name: "Default", sku: "NA-DAL-RED-1KG", price: 165, cost: 115, quantity: 40, isDefault: true },
    ],
  },
  {
    category: "spices-pantry",
    name: "Stone-Ground Turmeric",
    slug: "stone-ground-turmeric",
    description:
      "Bright, aromatic turmeric powder ground in small batches from carefully selected whole turmeric fingers.",
    featured: false,
    tags: ["spice", "turmeric", "pantry"],
    images: [image("photo-1615485500704-8e990f9900f7")],
    attributes: [],
    variants: [
      { name: "Default", sku: "NA-SPICE-TURMERIC-200G", price: 120, cost: 65, quantity: 50, isDefault: true },
    ],
  },
  {
    category: "natural-foods",
    name: "Premium Mabroom Dates",
    slug: "premium-mabroom-dates",
    description:
      "Soft and pleasantly chewy Mabroom dates with a balanced sweetness, packed for everyday snacking and gifting.",
    featured: false,
    tags: ["dates", "snack", "natural"],
    images: [image("photo-1629738601425-494c3d6ba3e2")],
    attributes: [],
    variants: [
      { name: "Default", sku: "NA-DATES-MABROOM-500G", price: 340, cost: 230, quantity: 25, isDefault: true },
    ],
  },
] as const;

type DemoVariant = {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  sku: string;
  price: number;
  cost: number;
  batchId: string;
};

type DemoOrderItem = {
  sku: string;
  quantity: number;
  discount?: number;
};

type DemoOrder = {
  orderNumber: string;
  source: "PHYSICAL_SHOP" | "WEBSITE" | "WHATSAPP" | "PHONE";
  status: "PENDING" | "CONFIRMED" | "DELIVERED" | "COMPLETED" | "CANCELLED";
  placedAt: Date;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  deliveryRateCode?: "DHAKA" | "OUTSIDE_DHAKA";
  customerProfileId?: string;
  items: DemoOrderItem[];
};

function margin(profit: number, revenue: number) {
  if (revenue === 0) return null;
  return new Prisma.Decimal(profit)
    .div(revenue)
    .mul(100)
    .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

async function main() {
  const owner = await prisma.profile.findFirst({
    where: { role: "OWNER", isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) {
    throw new Error("An active OWNER profile is required before demo data can be seeded");
  }

  const customer = await prisma.profile.findFirst({
    where: { role: "CUSTOMER", isActive: true },
    orderBy: { createdAt: "asc" },
  });

  await prisma.$transaction(
    async (transaction) => {
      await transaction.$executeRawUnsafe(`
        TRUNCATE TABLE
          "audit_logs",
          "order_allocations",
          "stock_adjustments",
          "stock_batches",
          "sales_order_items",
          "sales_orders",
          "selling_price_history",
          "delivery_rates",
          "product_variants",
          "products",
          "categories",
          "foundation_records"
      `);

      await transaction.foundationRecord.create({
        data: {
          key: "demo-dataset",
          value: "Nafah Agro showcase data seeded on 2026-08-01",
        },
      });

      const deliveryRates = new Map<string, string>();
      for (const rate of [
        { code: "DHAKA" as const, name: "Dhaka City", charge: 80 },
        { code: "OUTSIDE_DHAKA" as const, name: "Outside Dhaka", charge: 130 },
      ]) {
        const created = await transaction.deliveryRate.create({
          data: { ...rate, isActive: true, updatedByProfileId: owner.id },
        });
        deliveryRates.set(rate.code, created.id);
      }

      const categoryIds = new Map<string, string>();
      for (const category of [
        { name: "Rice & Grains", slug: "rice-grains" },
        { name: "Oils & Essentials", slug: "oils-essentials" },
        { name: "Honey & Natural Foods", slug: "natural-foods" },
        { name: "Spices & Pantry", slug: "spices-pantry" },
      ]) {
        const created = await transaction.category.create({ data: category });
        categoryIds.set(category.slug, created.id);
      }

      const variants = new Map<string, DemoVariant>();
      const purchaseGroupId = randomUUID();
      for (const productInput of products) {
        const categoryId = categoryIds.get(productInput.category);
        if (!categoryId) throw new Error(`Missing category ${productInput.category}`);

        const product = await transaction.product.create({
          data: {
            categoryId,
            name: productInput.name,
            slug: productInput.slug,
            description: productInput.description,
            featured: productInput.featured,
            tags: [...productInput.tags],
            images: [...productInput.images],
            attributes: productInput.attributes as unknown as Prisma.InputJsonValue,
          },
        });

        for (const variantInput of productInput.variants) {
          const variant = await transaction.productVariant.create({
            data: {
              productId: product.id,
              name: variantInput.name,
              sku: variantInput.sku,
              currentSellingPrice: variantInput.price,
              availableStock: variantInput.quantity,
              lowStockThreshold: Math.min(5, Math.floor(variantInput.quantity / 4)),
              isDefault: "isDefault" in variantInput && variantInput.isDefault === true,
            },
          });
          await transaction.sellingPriceHistory.create({
            data: {
              variantId: variant.id,
              previousPrice: null,
              newPrice: variantInput.price,
              reason: "Initial demo selling price",
              changedByProfileId: owner.id,
              effectiveAt: new Date("2026-07-01T06:00:00.000Z"),
            },
          });
          const batch = await transaction.stockBatch.create({
            data: {
              purchaseGroupId,
              productVariantId: variant.id,
              source: "PURCHASE",
              purchasedQuantity: variantInput.quantity,
              availableQuantity: variantInput.quantity,
              unitBuyingCost: variantInput.cost,
              purchaseDate: new Date("2026-07-10T00:00:00.000Z"),
              note: "Opening stock for the Nafah Agro demo",
              createdByProfileId: owner.id,
            },
          });
          variants.set(variant.sku, {
            productId: product.id,
            productName: product.name,
            variantId: variant.id,
            variantName: variant.name,
            sku: variant.sku,
            price: variantInput.price,
            cost: variantInput.cost,
            batchId: batch.id,
          });
        }
      }

      const orders: DemoOrder[] = [
        {
          orderNumber: "PHY-DEMO-1001",
          source: "PHYSICAL_SHOP",
          status: "COMPLETED",
          placedAt: new Date("2026-07-26T09:15:00.000Z"),
          customerName: "Walk-in Customer",
          items: [
            { sku: "NA-OIL-MUSTARD-1L", quantity: 1, discount: 20 },
            { sku: "NA-HONEY-RAW-500G", quantity: 1, discount: 30 },
          ],
        },
        {
          orderNumber: "PHY-DEMO-1002",
          source: "PHYSICAL_SHOP",
          status: "COMPLETED",
          placedAt: new Date("2026-07-28T11:40:00.000Z"),
          customerName: "Rahim Uddin",
          customerPhone: "01711000001",
          items: [{ sku: "NA-RICE-MINI-5KG", quantity: 2 }],
        },
        {
          orderNumber: "WEB-DEMO-1003",
          source: "WEBSITE",
          status: "DELIVERED",
          placedAt: new Date("2026-07-29T05:30:00.000Z"),
          customerName: "Nusrat Jahan",
          customerPhone: "01811000002",
          customerEmail: "nusrat.demo@example.com",
          customerAddress: "Dhanmondi, Dhaka",
          deliveryRateCode: "DHAKA",
          customerProfileId: customer?.id,
          items: [
            { sku: "NA-RICE-CHINI-1KG", quantity: 2 },
            { sku: "NA-GHEE-COW-500G", quantity: 1 },
          ],
        },
        {
          orderNumber: "WEB-DEMO-1004",
          source: "WEBSITE",
          status: "PENDING",
          placedAt: new Date("2026-08-01T04:20:00.000Z"),
          customerName: "Tanvir Ahmed",
          customerPhone: "01911000003",
          customerEmail: "tanvir.demo@example.com",
          customerAddress: "Rajshahi Sadar, Rajshahi",
          deliveryRateCode: "OUTSIDE_DHAKA",
          items: [
            { sku: "NA-DAL-RED-1KG", quantity: 2 },
            { sku: "NA-DATES-MABROOM-500G", quantity: 1 },
          ],
        },
        {
          orderNumber: "MAN-DEMO-1005",
          source: "WHATSAPP",
          status: "CONFIRMED",
          placedAt: new Date("2026-08-01T06:10:00.000Z"),
          customerName: "Farzana Akter",
          customerPhone: "01611000004",
          customerAddress: "Uttara, Dhaka",
          deliveryRateCode: "DHAKA",
          items: [
            { sku: "NA-SPICE-TURMERIC-200G", quantity: 3 },
            { sku: "NA-OIL-MUSTARD-5L", quantity: 1 },
          ],
        },
        {
          orderNumber: "MAN-DEMO-1006",
          source: "PHONE",
          status: "CANCELLED",
          placedAt: new Date("2026-07-30T08:05:00.000Z"),
          customerName: "Demo Cancelled Customer",
          customerPhone: "01511000005",
          customerAddress: "Cumilla Sadar, Cumilla",
          deliveryRateCode: "OUTSIDE_DHAKA",
          items: [{ sku: "NA-HONEY-RAW-1KG", quantity: 1 }],
        },
      ];

      for (const orderInput of orders) {
        const itemDetails = orderInput.items.map((item) => {
          const variant = variants.get(item.sku);
          if (!variant) throw new Error(`Missing demo variant ${item.sku}`);
          const grossRevenue = variant.price * item.quantity;
          const discount = item.discount ?? 0;
          return { ...item, ...variant, grossRevenue, discount, netRevenue: grossRevenue - discount };
        });
        const allocatesStock = ["CONFIRMED", "DELIVERED", "COMPLETED"].includes(orderInput.status);
        const reservesStock = orderInput.status === "CONFIRMED";
        const subtotal = itemDetails.reduce((sum, item) => sum + item.grossRevenue, 0);
        const discountTotal = itemDetails.reduce((sum, item) => sum + item.discount, 0);
        const productRevenue = subtotal - discountTotal;
        const buyingCost = allocatesStock
          ? itemDetails.reduce((sum, item) => sum + item.cost * item.quantity, 0)
          : null;
        const grossProfit = buyingCost === null ? null : productRevenue - buyingCost;
        const deliveryRateId = orderInput.deliveryRateCode
          ? deliveryRates.get(orderInput.deliveryRateCode)
          : undefined;
        const deliveryCharge = orderInput.deliveryRateCode === "DHAKA"
          ? 80
          : orderInput.deliveryRateCode === "OUTSIDE_DHAKA"
            ? 130
            : 0;
        const isWebsite = orderInput.source === "WEBSITE";
        const completedAt = orderInput.status === "COMPLETED" ? orderInput.placedAt : null;
        const deliveredAt = orderInput.status === "DELIVERED" ? orderInput.placedAt : null;
        const confirmedAt = ["CONFIRMED", "DELIVERED"].includes(orderInput.status)
          ? orderInput.placedAt
          : null;
        const cancelledAt = orderInput.status === "CANCELLED" ? orderInput.placedAt : null;

        const order = await transaction.salesOrder.create({
          data: {
            orderNumber: orderInput.orderNumber,
            idempotencyKey: isWebsite ? `demo-${orderInput.orderNumber.toLowerCase()}` : null,
            requestFingerprint: isWebsite ? `demo-fingerprint-${orderInput.orderNumber.toLowerCase()}` : null,
            source: orderInput.source,
            status: orderInput.status,
            paymentMethod: orderInput.source === "PHYSICAL_SHOP" ? "CASH" : "CASH_ON_DELIVERY",
            paymentStatus: ["COMPLETED", "DELIVERED"].includes(orderInput.status) ? "PAID" : "UNPAID",
            customerProfileId: orderInput.customerProfileId,
            customerName: orderInput.customerName,
            customerPhone: orderInput.customerPhone,
            customerEmail: orderInput.customerEmail,
            customerAddress: orderInput.customerAddress,
            deliveryRateId,
            deliveryCharge,
            subtotal,
            discountTotal,
            grandTotal: productRevenue + deliveryCharge,
            totalBuyingCost: buyingCost,
            grossProfit,
            grossProfitMargin: grossProfit === null ? null : margin(grossProfit, productRevenue),
            createdByProfileId: isWebsite ? null : owner.id,
            placedAt: orderInput.placedAt,
            confirmedAt,
            completedAt,
            deliveredAt,
            cancelledAt,
            statusReason: orderInput.status === "CANCELLED" ? "Customer changed their mind (demo)" : null,
          },
        });

        for (const item of itemDetails) {
          const lineCost = allocatesStock ? item.cost * item.quantity : null;
          const orderItem = await transaction.salesOrderItem.create({
            data: {
              salesOrderId: order.id,
              productId: item.productId,
              productVariantId: item.variantId,
              productNameSnapshot: item.productName,
              variantNameSnapshot: item.variantName,
              skuSnapshot: item.sku,
              quantity: item.quantity,
              unitSellingPrice: item.price,
              grossLineRevenue: item.grossRevenue,
              allocatedDiscount: item.discount,
              netLineRevenue: item.netRevenue,
              totalBuyingCost: lineCost,
              grossProfit: lineCost === null ? null : item.netRevenue - lineCost,
            },
          });

          if (allocatesStock) {
            await transaction.stockBatch.update({
              where: { id: item.batchId },
              data: {
                availableQuantity: { decrement: item.quantity },
                reservedQuantity: reservesStock ? { increment: item.quantity } : undefined,
              },
            });
            await transaction.productVariant.update({
              where: { id: item.variantId },
              data: {
                availableStock: { decrement: item.quantity },
                reservedStock: reservesStock ? { increment: item.quantity } : undefined,
              },
            });
            await transaction.orderAllocation.create({
              data: {
                salesOrderItemId: orderItem.id,
                stockBatchId: item.batchId,
                quantity: item.quantity,
                unitBuyingCost: item.cost,
                totalBuyingCost: item.cost * item.quantity,
                state: reservesStock ? "RESERVED" : "CONSUMED",
                reservedAt: orderInput.source === "PHYSICAL_SHOP" ? null : orderInput.placedAt,
                consumedAt: reservesStock ? null : orderInput.placedAt,
              },
            });
          }
        }
      }
    },
    { timeout: 60_000 },
  );

  const summary = {
    preservedProfiles: await prisma.profile.count(),
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    variants: await prisma.productVariant.count(),
    stockBatches: await prisma.stockBatch.count(),
    orders: await prisma.salesOrder.count(),
    deliveryRates: await prisma.deliveryRate.count(),
  };
  console.log("Nafah Agro demo data is ready:", summary);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
