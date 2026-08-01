import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import Order from '../models/Order.js';

// Temporary MongoDB order router. It is removed when the PostgreSQL order
// vertical lands. Guest creation is deliberately public; all management paths
// are protected by Supabase profile middleware supplied by app.ts.
export function createOrderRouter(
  authenticate: RequestHandler,
  requireAdminOrOwner: RequestHandler,
  protectedLimiter: RequestHandler,
) {
  const router = Router();
  const management = [protectedLimiter, authenticate, requireAdminOrOwner];
  const optionalAuthentication: RequestHandler = (req, res, next) => {
    if (!req.headers.authorization) {
      next();
      return;
    }
    authenticate(req, res, next);
  };

  router.get('/my', protectedLimiter, authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orders = await Order.find({ 'placedBy.userId': req.authenticatedUser!.profile.id }).sort({ createdAt: -1 }).lean();
      res.json(orders.map(({ _id, ...rest }) => ({ ...rest, id: String(_id) })));
    } catch (error) { next(error); }
  });

  router.get('/', ...management, async (_req, res, next) => {
    try {
      const orders = await Order.find().sort({ createdAt: -1 }).lean();
      res.json(orders.map(({ _id, ...rest }) => ({ ...rest, id: String(_id) })));
    } catch (error) { next(error); }
  });

  router.post('/', optionalAuthentication, async (req, res, next) => {
    try {
      const orderInput = { ...req.body } as Record<string, unknown>;
      delete orderInput.placedBy;
      if (req.authenticatedUser) {
        orderInput.placedBy = {
          userId: req.authenticatedUser.profile.id,
          userName: req.authenticatedUser.profile.fullName,
          userRole: req.authenticatedUser.profile.role,
        };
      }
      const order = await Order.create(orderInput);
      const { _id, ...rest } = order.toObject();
      res.status(201).json({ ...rest, id: String(_id) });
    } catch (error) { next(error); }
  });

  router.get('/:id', ...management, async (req, res, next) => {
    try {
      const order = await Order.findById(req.params.id).lean();
      if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
      const { _id, ...rest } = order;
      res.json({ ...rest, id: String(_id) });
    } catch (error) { next(error); }
  });

  router.patch('/:id/status', ...management, async (req, res, next) => {
    try {
      const order = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true }).lean();
      if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
      const { _id, ...rest } = order; res.json({ ...rest, id: String(_id) });
    } catch (error) { next(error); }
  });

  router.patch('/:id/payment', ...management, async (req, res, next) => {
    try {
      const order = await Order.findByIdAndUpdate(req.params.id, {
        ...(req.body.paymentStatus ? { paymentStatus: req.body.paymentStatus } : {}),
        ...(req.body.paymentReference !== undefined ? { paymentReference: req.body.paymentReference } : {}),
      }, { new: true }).lean();
      if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
      const { _id, ...rest } = order; res.json({ ...rest, id: String(_id) });
    } catch (error) { next(error); }
  });

  router.patch('/:id/delivery', ...management, async (req, res, next) => {
    try {
      const order = await Order.findByIdAndUpdate(req.params.id, {
        deliveryTeam: req.body.deliveryTeam,
        deliveryRider: req.body.deliveryRider,
        deliveryNotes: req.body.deliveryNotes,
      }, { new: true }).lean();
      if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
      const { _id, ...rest } = order; res.json({ ...rest, id: String(_id) });
    } catch (error) { next(error); }
  });
  return router;
}
