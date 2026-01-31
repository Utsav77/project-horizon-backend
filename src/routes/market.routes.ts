import { Router } from 'express';
import marketController from '../controllers/market.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// GET /market/quote/:symbol
router.get('/quote/:symbol', authenticateToken, marketController.getQuote.bind(marketController));

// POST /market/quotes (body: { symbols: ['AAPL', 'GOOGL'] })
router.post('/quotes', authenticateToken, marketController.getMultipleQuotes.bind(marketController));

// GET /market/search?q=apple
router.get('/search', authenticateToken, marketController.search.bind(marketController));

export default router;