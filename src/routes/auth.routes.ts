import { Router } from 'express';
import authController from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// public
router.post('/register', authController.register.bind(authController));
router.post('/login', authController.login.bind(authController));
router.post('/refresh', authController.refresh.bind(authController));

// protected
router.post('/logout', authenticateToken, authController.logout.bind(authController));
router.get('/me', authenticateToken, authController.getCurrentUser.bind(authController));

export default router;