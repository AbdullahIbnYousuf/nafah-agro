import { Router, Request, Response, NextFunction } from 'express';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// GET /api/orders/my — Get current user's own orders
// Must be defined BEFORE /:id to avoid route conflict
router.get('/my', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orders = await Order.find({ 'placedBy.userId': req.user!.id })
      .sort({ createdAt: -1 })
      .lean();

    const role = req.user!.role;

    const normalized = orders.map(({ _id, ...rest }) => {
      const order: Record<string, unknown> = { ...rest, id: String(_id) };

      // Customers only see summary — strip delivery team details
      if (role === 'customer') {
        delete order.deliveryTeam;
        delete order.deliveryRider;
        delete order.deliveryNotes;
      }

      return order;
    });

    res.json(normalized);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders — All orders (admin/moderator only)
router.get('/', authenticate, authorize('admin', 'moderator'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).lean();
    const normalized = orders.map(({ _id, ...rest }) => ({ ...rest, id: String(_id) }));
    res.json(normalized);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id — Single order (admin/moderator only)
router.get('/:id', authenticate, authorize('admin', 'moderator'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const { _id, ...rest } = order;
    res.json({ ...rest, id: String(_id) });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders — Create order (any authenticated user)
router.post('/', authenticate, authorize('admin', 'moderator', 'customer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const placer = await User.findById(req.user!.id).select('name role').lean();
    const placedBy = {
      userId: req.user!.id,
      userName: placer?.name ?? 'Unknown',
      userRole: req.user!.role,
    };

    const order = await Order.create({ ...req.body, placedBy });
    const { _id, ...rest } = order.toObject();
    res.status(201).json({ ...rest, id: String(_id) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orders/:id/status — Update order status (admin/moderator)
router.patch('/:id/status', authenticate, authorize('admin', 'moderator'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const { _id, ...rest } = order;
    res.json({ ...rest, id: String(_id) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orders/:id/payment — Update payment status & reference (admin/moderator)
router.patch('/:id/payment', authenticate, authorize('admin', 'moderator'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { paymentStatus, paymentReference } = req.body;
    const update: Record<string, unknown> = {};
    if (paymentStatus) update.paymentStatus = paymentStatus;
    if (paymentReference !== undefined) update.paymentReference = paymentReference;

    const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const { _id, ...rest } = order;
    res.json({ ...rest, id: String(_id) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orders/:id/delivery — Update delivery info (admin/moderator)
router.patch('/:id/delivery', authenticate, authorize('admin', 'moderator'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deliveryTeam, deliveryRider, deliveryNotes } = req.body;
    const update: Record<string, unknown> = {};
    if (deliveryTeam !== undefined) update.deliveryTeam = deliveryTeam;
    if (deliveryRider !== undefined) update.deliveryRider = deliveryRider;
    if (deliveryNotes !== undefined) update.deliveryNotes = deliveryNotes;

    const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const { _id, ...rest } = order;
    res.json({ ...rest, id: String(_id) });
  } catch (err) {
    next(err);
  }
});

export default router;
