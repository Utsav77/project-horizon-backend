import { Request, Response } from 'express';
import authService from '../services/auth.service';
import { registerSchema, loginSchema, refreshTokenSchema } from '../utils/validation';
import { ZodError } from 'zod';

class AuthController {
   // POST /auth/register
  async register(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = registerSchema.parse(req.body);
      const result = await authService.register(validatedData);
      res.status(201).json({
        message: 'User registered successfully',
        data: result,
      });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({
              error: 'Validation failed',
              details: error.issues.map((issue) => ({
                field: issue.path.join('.'),
                message: issue.message,
              })),
            });
            return;
          }
      // Handle business logic errors
      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          res.status(409).json({ error: error.message });
          return;
        }
        res.status(400).json({ error: error.message });
        return;
      }
      // Unexpected errors
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

   // POST /auth/login
  async login(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = loginSchema.parse(req.body);
      const result = await authService.login(validatedData);
      res.status(200).json({
        message: 'Login successful',
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: {
            id: result.userId,
            email: result.email,
          },
        },
      });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({
              error: 'Validation failed',
              details: error.issues.map((issue) => ({
                field: issue.path.join('.'),
                message: issue.message,
              })),
            });
            return;
        }
      if (error instanceof Error) {
        if (error.message.includes('Invalid email or password')) {
          res.status(401).json({ error: 'Invalid email or password' });
          return;
        }
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

   // POST /auth/refresh
  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = refreshTokenSchema.parse(req.body);
      const result = await authService.refreshAccessToken(validatedData.refreshToken);
      res.status(200).json({
        message: 'Token refreshed successfully',
        data: {
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({
              error: 'Validation failed',
              details: error.issues.map((issue) => ({
                field: issue.path.join('.'),
                message: issue.message,
              })),
            });
            return;
        }
      if (error instanceof Error) {
        res.status(401).json({ error: error.message });
        return;
      }
      console.error('Refresh error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

   // POST /auth/logout
  async logout(req: Request, res: Response): Promise<void> {
    try {
      // req.userId is added by authenticateToken middleware
      if (!req.userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      await authService.logout(req.userId);
      res.status(200).json({
        message: 'Logout successful',
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

   // GET /auth/me
  async getCurrentUser(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      // For now, just returning the userId from token
      res.status(200).json({
        data: {
          userId: req.userId,
        },
      });
    } catch (error) {
      console.error('Get current user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default new AuthController();