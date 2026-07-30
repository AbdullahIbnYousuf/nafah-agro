import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { getBackendEnv } from '../env.js';

export interface AuthPayload {
  id: string;
  role: 'admin' | 'moderator' | 'customer';
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthPayload;
  }
}

/**
 * Middleware: verify JWT from Authorization header.
 * Attaches `req.user = { id, role }` on success.
 * Also checks that the user account is still active (not deactivated by admin).
 * Returns 401 if token is missing/invalid, 403 if account is deactivated.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getBackendEnv().JWT_SECRET) as AuthPayload;

    // Check that the user is still active in the database
    const user = await User.findById(decoded.id).select('isActive role').lean();
    if (!user) {
      res.status(401).json({ error: 'User account not found' });
      return;
    }
    // Only enforce isActive for moderators — admins and customers are never deactivated
    if (user.role === 'moderator' && user.isActive === false) {
      res.status(403).json({ error: 'Account has been deactivated. Contact your admin.' });
      return;
    }

    req.user = { id: decoded.id, role: user.role as AuthPayload['role'] };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware factory: restrict access to specific roles.
 * Must be used AFTER `authenticate`.
 */
export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

/**
 * Generate a JWT for a user.
 */
export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, getBackendEnv().JWT_SECRET, { expiresIn: '7d' });
}
