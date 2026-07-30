import mongoose from 'mongoose';
import Category from './models/Category.js';
import Product from './models/Product.js';
import { getBackendEnv } from './env.js';

const { MONGO_URI } = getBackendEnv();

const categories = [
  { name: 'দুগ্ধজাত পণ্য', slug: 'dairy' },
  { name: 'ডিম', slug: 'eggs' },
  { name: 'মধু', slug: 'honey' },
  { name: 'মাংস', slug: 'meat' },
  { name: 'শাকসবজি', slug: 'vegetables' },
  { name: 'ফলমূল', slug: 'fruits' },
  { name: 'মাছ', slug: 'fish' },
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Clear existing data
  await Category.deleteMany({});
  await Product.deleteMany({});
  console.log('Cleared existing categories and products');

  // Insert categories
  const insertedCategories = await Category.insertMany(categories);
  console.log(`Inserted ${insertedCategories.length} categories`);

  const catMap = Object.fromEntries(
    insertedCategories.map((c) => [c.slug, c._id])
  );

  const products = [
    // ── Dairy ────────────────────────────────────────────────────────────────
    {
      name: 'দেশি গরুর খাঁটি দুধ',
      slug: 'deshi-goru-khati-dudh',
      description: 'সম্পূর্ণ প্রাকৃতিক উপায়ে পালিত দেশি গরুর তাজা দুধ। কোনো ভেজাল নেই।',
      price: 80,
      categoryId: catMap['dairy'],
      images: [],
      youtubeLinks: [],
      attributes: [
        {
          name: 'পরিমাণ',
          options: [
            { label: '১ লিটার', value: '1L', priceModifier: 0 },
            { label: '২ লিটার', value: '2L', priceModifier: 80 },
            { label: '৫ লিটার', value: '5L', priceModifier: 320 },
          ],
        },
      ],
      stock: 50,
      featured: true,
    },
    {
      name: 'ঘি (দেশি)',
      slug: 'deshi-ghee',
      description: 'দেশি গরুর দুধ থেকে তৈরি খাঁটি ঘি। রান্না ও স্বাস্থ্যের জন্য উপকারী।',
      price: 600,
      categoryId: catMap['dairy'],
      images: [],
      youtubeLinks: [],
      attributes: [
        {
          name: 'পরিমাণ',
          options: [
            { label: '২৫০ গ্রাম', value: '250g', priceModifier: 0 },
            { label: '৫০০ গ্রাম', value: '500g', priceModifier: 600 },
            { label: '১ কেজি', value: '1kg', priceModifier: 1400 },
          ],
        },
      ],
      stock: 30,
      featured: false,
    },
    {
      name: 'টক দই',
      slug: 'tok-doi',
      description: 'হাতে তৈরি মিষ্টি টক দই। মিষ্টি ও টক উভয় স্বাদে পাওয়া যায়।',
      price: 60,
      categoryId: catMap['dairy'],
      images: [],
      youtubeLinks: [],
      attributes: [
        {
          name: 'পরিমাণ',
          options: [
            { label: '২৫০ গ্রাম', value: '250g', priceModifier: 0 },
            { label: '৫০০ গ্রাম', value: '500g', priceModifier: 60 },
          ],
        },
      ],
      stock: 40,
      featured: false,
    },

    // ── Eggs ─────────────────────────────────────────────────────────────────
    {
      name: 'দেশি মুরগির ডিম',
      slug: 'deshi-murgir-dim',
      description: 'খোলা মাঠে বিচরণকারী দেশি মুরগির তাজা ডিম। পুষ্টিগুণে ভরপুর।',
      price: 80,
      categoryId: catMap['eggs'],
      images: [],
      youtubeLinks: [],
      attributes: [
        {
          name: 'পরিমাণ',
          options: [
            { label: 'হালি (৪টি)', value: 'hali-4', priceModifier: 0 },
            { label: 'ডজন (১২টি)', value: 'dozen-12', priceModifier: 160 },
            { label: 'আড়াই ডজন (৩০টি)', value: 'arai-dozen-30', priceModifier: 520 },
          ],
        },
      ],
      stock: 200,
      featured: true,
    },
    {
      name: 'হাঁসের ডিম',
      slug: 'haser-dim',
      description: 'দেশীয় হাঁসের তাজা ডিম। বড় আকার ও পুষ্টিকর।',
      price: 100,
      categoryId: catMap['eggs'],
      images: [],
      youtubeLinks: [],
      attributes: [
        {
          name: 'পরিমাণ',
          options: [
            { label: 'হালি (৪টি)', value: 'hali-4', priceModifier: 0 },
            { label: 'ডজন (১২টি)', value: 'dozen-12', priceModifier: 200 },
          ],
        },
      ],
      stock: 80,
      featured: false,
    },

    // ── Honey ────────────────────────────────────────────────────────────────
    {
      name: 'সুন্দরবনের মধু',
      slug: 'sundarban-modhu',
      description: 'সুন্দরবনের মৌমাছি থেকে সংগ্রহ করা খাঁটি প্রাকৃতিক মধু। কোনো প্রক্রিয়াজাত নয়।',
      price: 500,
      categoryId: catMap['honey'],
      images: [],
      youtubeLinks: [],
      attributes: [
        {
          name: 'পরিমাণ',
          options: [
            { label: '২৫০ গ্রাম', value: '250g', priceModifier: 0 },
            { label: '৫০০ গ্রাম', value: '500g', priceModifier: 500 },
            { label: '১ কেজি', value: '1kg', priceModifier: 1100 },
          ],
        },
      ],
      stock: 25,
      featured: true,
    },
    {
      name: 'সরিষা ফুলের মধু',
      slug: 'sorisar-ful-er-modhu',
      description: 'সরিষা ফুল থেকে সংগ্রহ করা হালকা রঙের খাঁটি মধু।',
      price: 400,
      categoryId: catMap['honey'],
      images: [],
      youtubeLinks: [],
      attributes: [
        {
          name: 'পরিমাণ',
          options: [
            { label: '২৫০ গ্রাম', value: '250g', priceModifier: 0 },
            { label: '৫০০ গ্রাম', value: '500g', priceModifier: 400 },
            { label: '১ কেজি', value: '1kg', priceModifier: 900 },
          ],
        },
      ],
      stock: 35,
      featured: false,
    },

    // ── Meat ─────────────────────────────────────────────────────────────────
    {
      name: 'দেশি মুরগির মাংস',
      slug: 'deshi-murgir-mangsho',
      description: 'মুক্তভাবে বিচরণকারী দেশি মুরগির তাজা মাংস। কোনো হরমোন বা এন্টিবায়োটিক ছাড়া।',
      price: 550,
      categoryId: catMap['meat'],
      images: [],
      youtubeLinks: [],
      attributes: [
        {
          name: 'পরিমাণ',
          options: [
            { label: '৫০০ গ্রাম', value: '500g', priceModifier: 0 },
            { label: '১ কেজি', value: '1kg', priceModifier: 550 },
          ],
        },
      ],
      stock: 15,
      featured: true,
    },
    {
      name: 'খাসির মাংস',
      slug: 'khasir-mangsho',
      description: 'তাজা দেশি খাসির মাংস। প্রাকৃতিক খাদ্যে পালিত।',
      price: 900,
      categoryId: catMap['meat'],
      images: [],
      youtubeLinks: [],
      attributes: [
        {
          name: 'পরিমাণ',
          options: [
            { label: '৫০০ গ্রাম', value: '500g', priceModifier: 0 },
            { label: '১ কেজি', value: '1kg', priceModifier: 900 },
            { label: '২ কেজি', value: '2kg', priceModifier: 1900 },
          ],
        },
      ],
      stock: 10,
      featured: false,
    },

    // ── Vegetables ───────────────────────────────────────────────────────────
    {
      name: 'জৈব পালং শাক',
      slug: 'joibo-palong-shak',
      description: 'সম্পূর্ণ জৈব পদ্ধতিতে চাষ করা তাজা পালং শাক। কোনো কৃত্রিম সার ব্যবহার হয়নি।',
      price: 30,
      categoryId: catMap['vegetables'],
      images: [],
      youtubeLinks: [],
      attributes: [
        {
          name: 'পরিমাণ',
          options: [
            { label: '৫০০ গ্রাম', value: '500g', priceModifier: 0 },
            { label: '১ কেজি', value: '1kg', priceModifier: 30 },
          ],
        },
      ],
      stock: 60,
      featured: false,
    },
    {
      name: 'দেশি টমেটো',
      slug: 'deshi-tomato',
      description: 'বাড়ির বাগানে চাষ করা টাটকা লাল টমেটো।',
      price: 40,
      categoryId: catMap['vegetables'],
      images: [],
      youtubeLinks: [],
      attributes: [
        {
          name: 'পরিমাণ',
          options: [
            { label: '৫০০ গ্রাম', value: '500g', priceModifier: 0 },
            { label: '১ কেজি', value: '1kg', priceModifier: 40 },
          ],
        },
      ],
      stock: 70,
      featured: false,
    },

    // ── Fruits ───────────────────────────────────────────────────────────────
    {
      name: 'দেশি আম (হিমসাগর)',
      slug: 'deshi-am-himsagar',
      description: 'রাজশাহীর বিখ্যাত হিমসাগর আম। মিষ্টি ও সুগন্ধি।',
      price: 180,
      categoryId: catMap['fruits'],
      images: [],
      youtubeLinks: [],
      attributes: [
        {
          name: 'পরিমাণ',
          options: [
            { label: '১ কেজি', value: '1kg', priceModifier: 0 },
            { label: '৩ কেজি', value: '3kg', priceModifier: 500 },
            { label: '৫ কেজি', value: '5kg', priceModifier: 850 },
          ],
        },
      ],
      stock: 45,
      featured: true,
    },
    {
      name: 'দেশি কলা (সাগর কলা)',
      slug: 'deshi-kola-sagor',
      description: 'প্রাকৃতিকভাবে পাকা সাগর কলা। কোনো কৃত্রিম পাকন ছাড়া।',
      price: 60,
      categoryId: catMap['fruits'],
      images: [],
      youtubeLinks: [],
      attributes: [
        {
          name: 'পরিমাণ',
          options: [
            { label: 'এক হালি (৪টি)', value: 'hali-4', priceModifier: 0 },
            { label: 'এক ডজন (১২টি)', value: 'dozen-12', priceModifier: 120 },
          ],
        },
      ],
      stock: 55,
      featured: false,
    },

    // ── Fish ─────────────────────────────────────────────────────────────────
    {
      name: 'দেশি রুই মাছ',
      slug: 'deshi-rui-mach',
      description: 'পুকুরের তাজা দেশি রুই মাছ। কোনো রাসায়নিক ছাড়া পালন করা।',
      price: 250,
      categoryId: catMap['fish'],
      images: [],
      youtubeLinks: [],
      attributes: [
        {
          name: 'পরিমাণ',
          options: [
            { label: '৫০০ গ্রাম', value: '500g', priceModifier: 0 },
            { label: '১ কেজি', value: '1kg', priceModifier: 250 },
            { label: '২ কেজি', value: '2kg', priceModifier: 520 },
          ],
        },
      ],
      stock: 20,
      featured: true,
    },
    {
      name: 'দেশি কাতলা মাছ',
      slug: 'deshi-katla-mach',
      description: 'নদীর তাজা কাতলা মাছ। সম্পূর্ণ প্রাকৃতিক পরিবেশে পালিত।',
      price: 280,
      categoryId: catMap['fish'],
      images: [],
      youtubeLinks: [],
      attributes: [
        {
          name: 'পরিমাণ',
          options: [
            { label: '৫০০ গ্রাম', value: '500g', priceModifier: 0 },
            { label: '১ কেজি', value: '1kg', priceModifier: 280 },
          ],
        },
      ],
      stock: 18,
      featured: false,
    },
  ];

  const insertedProducts = await Product.insertMany(products);
  console.log(`Inserted ${insertedProducts.length} products`);

  console.log('\n=== Seed Summary ===');
  console.log(`Categories: ${insertedCategories.length}`);
  insertedCategories.forEach((c) => console.log(`  - ${c.name} (${c.slug})`));
  console.log(`Products: ${insertedProducts.length}`);
  insertedProducts.forEach((p) => console.log(`  - ${p.name} (${p.slug})`));

  await mongoose.disconnect();
  console.log('\nDone.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
