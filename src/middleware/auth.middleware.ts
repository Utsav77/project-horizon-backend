import { Request, Response, NextFunction } from 'express';
import authService from '../services/auth.service';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

// Middleware to verify JWT access token
export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
      res.status(401).json({ error: 'Invalid token format' });
      return;
    }
    const userId = authService.verifyAccessToken(token);
    req.userId = userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
};