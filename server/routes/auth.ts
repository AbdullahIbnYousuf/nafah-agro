import { Router, Request, Response, NextFunction } from 'express';
import User from '../models/User.js';
import { authenticate, authorize, generateToken } from '../middleware/auth.js';
import { getBackendEnv } from '../env.js';

const router = Router();

// POST /api/auth/register — Customer self-registration
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = await User.create({ name, email, password, role: 'customer' });
    const token = generateToken({ id: String(user._id), role: user.role });

    res.status(201).json({
      token,
      user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register/admin — Admin creation (requires unlock code)
router.post('/register/admin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, unlockCode } = req.body;

    if (!name || !email || !password || !unlockCode) {
      return res.status(400).json({ error: 'Name, email, password, and unlockCode are required' });
    }

    if (unlockCode !== getBackendEnv().ADMIN_UNLOCK_CODE) {
      return res.status(403).json({ error: 'Invalid unlock code' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = await User.create({ name, email, password, role: 'admin' });
    const token = generateToken({ id: String(user._id), role: user.role });

    res.status(201).json({
      token,
      user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register/moderator — Only admins can create moderators
router.post(
  '/register/moderator',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, password } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
      }

      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const user = await User.create({
        name,
        email,
        password,
        role: 'moderator',
        createdBy: req.user!.id,
      });

      res.status(201).json({
        user: {
          id: String(user._id),
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/login — Customer and Admin login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Moderators must use the separate moderator login
    if (user.role === 'moderator') {
      return res.status(403).json({ error: 'Moderators must use the moderator login page' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account has been deactivated' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken({ id: String(user._id), role: user.role });

    res.json({
      token,
      user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login/moderator — Separate moderator login
router.post('/login/moderator', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.role !== 'moderator') {
      return res.status(401).json({ error: 'Invalid moderator credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Your account has been deactivated. Contact admin.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid moderator credentials' });
    }

    const token = generateToken({ id: String(user._id), role: user.role });

    res.json({
      token,
      user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/moderator/request-reset — Unauthenticated: moderator requests password reset
router.post('/moderator/request-reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase(), role: 'moderator' });
    if (!user) {
      // Don't reveal whether the email exists — always return success
      return res.json({ message: 'If the email is registered, a reset request has been sent to admin.' });
    }

    user.passwordResetRequested = true;
    await user.save();

    res.json({ message: 'Password reset request sent to admin. They will contact you soon.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — Get current user profile
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.id).select('-password').lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { _id, ...rest } = user;
    res.json({ ...rest, id: String(_id) });
  } catch (err) {
    next(err);
  }
});

// ── Moderator management (admin only) ─────────────────────────────────────────

// GET /api/auth/moderators — List all moderators
router.get(
  '/moderators',
  authenticate,
  authorize('admin'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const moderators = await User.find({ role: 'moderator' })
        .select('-password')
        .sort({ createdAt: -1 })
        .lean();
      const normalized = moderators.map(({ _id, ...rest }) => ({ ...rest, id: String(_id) }));
      res.json(normalized);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/auth/moderators/:id/reset-password — Admin resets moderator password
router.patch(
  '/moderators/:id/reset-password',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }

      const user = await User.findById(req.params.id);
      if (!user || user.role !== 'moderator') {
        return res.status(404).json({ error: 'Moderator not found' });
      }

      user.password = newPassword;
      user.passwordResetRequested = false;
      await user.save(); // triggers pre-save bcrypt hash

      res.json({ message: 'Password reset successfully' });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/auth/moderators/:id/toggle-active — Admin enables/disables moderator
router.patch(
  '/moderators/:id/toggle-active',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user || user.role !== 'moderator') {
        return res.status(404).json({ error: 'Moderator not found' });
      }

      user.isActive = !user.isActive;
      await user.save();

      const { _id, password, ...rest } = user.toObject();
      res.json({ ...rest, id: String(_id) });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/auth/moderators/:id — Admin deletes moderator
router.delete(
  '/moderators/:id',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user || user.role !== 'moderator') {
        return res.status(404).json({ error: 'Moderator not found' });
      }

      await User.findByIdAndDelete(req.params.id);
      res.json({ message: 'Moderator deleted' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
