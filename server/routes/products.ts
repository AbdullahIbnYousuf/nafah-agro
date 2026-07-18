import { Router, Request, Response, NextFunction } from 'express';
import Product from '../models/Product.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// GET /api/products
// Query params:
//   query        – free-text search string
//   type         – "product" (name+desc+tags) | "category" (categoryId exact match slug/id)
//   category     – categoryId filter (always applied when present, regardless of type)
//   tag          – single tag filter
//   featured     – "true" | "false"
//   minPrice     – number
//   maxPrice     – number
//   sort         – newest | oldest | price_asc | price_desc | name_asc | name_desc
//   page         – 1-based page number (default 1)
//   limit        – items per page (default 20, max 100)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      query: q,
      type,
      category,
      tag,
      featured,
      minPrice,
      maxPrice,
      sort,
      page: pageParam,
      limit: limitParam,
    } = req.query as Record<string, string | undefined>;

    const filter: Record<string, any> = {};

    // Free-text search
    if (q) {
      if (type === 'category') {
        // query targets category name — resolved on frontend by passing categoryId,
        // but here also support passing a category slug/name as `query` with type=category
        filter.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
        ];
      } else {
        // default: search name + description + tags
        filter.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { tags: { $regex: q, $options: 'i' } },
        ];
      }
    }

    // Category filter
    if (category) filter.categoryId = category;

    // Tag filter
    if (tag) filter.tags = tag;

    // Featured filter
    if (featured === 'true') filter.featured = true;
    else if (featured === 'false') filter.featured = false;

    // Price range
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    // Sort
    let sortOpt: Record<string, 1 | -1> = { createdAt: -1 };
    if (sort === 'oldest')     sortOpt = { createdAt: 1 };
    else if (sort === 'price_asc')  sortOpt = { price: 1 };
    else if (sort === 'price_desc') sortOpt = { price: -1 };
    else if (sort === 'name_asc')   sortOpt = { name: 1 };
    else if (sort === 'name_desc')  sortOpt = { name: -1 };

    // Pagination
    const limit = Math.min(Math.max(Number(limitParam) || 20, 1), 100);
    const page  = Math.max(Number(pageParam) || 1, 1);
    const skip  = (page - 1) * limit;

    const [products, total] = await Promise.all([
      Product.find(filter).sort(sortOpt).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);

    const data = products.map(({ _id, categoryId, ...rest }) => ({
      ...rest,
      id: String(_id),
      categoryId: String(categoryId),
    }));

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/tags
router.get('/tags', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tags = await Product.distinct('tags');
    res.json(tags.filter(Boolean).sort());
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:slug
router.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug }).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const { _id, categoryId, ...rest } = product;
    res.json({ ...rest, id: String(_id), categoryId: String(categoryId) });
  } catch (err) {
    next(err);
  }
});

// POST /api/products
router.post('/', authenticate, authorize('admin', 'moderator'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await Product.create(req.body);
    const { _id, categoryId, ...rest } = product.toObject();
    res.status(201).json({ ...rest, id: String(_id), categoryId: String(categoryId) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/products/:id
router.put('/:id', authenticate, authorize('admin', 'moderator'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const { _id, categoryId, ...rest } = product;
    res.json({ ...rest, id: String(_id), categoryId: String(categoryId) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/products/:id/stock
router.patch('/:id/stock', authenticate, authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { stock } = req.body;
    const product = await Product.findByIdAndUpdate(req.params.id, { stock }, { new: true }).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const { _id, categoryId, ...rest } = product;
    res.json({ ...rest, id: String(_id), categoryId: String(categoryId) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
