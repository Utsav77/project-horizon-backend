import { Request, Response } from 'express';
import marketDataService from '../services/market-data.service';
import { z } from 'zod';

const symbolSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
});

const multipleSymbolsSchema = z.object({
  symbols: z.array(z.string()).min(1).max(20),
});

const searchSchema = z.object({
  q: z.string().min(1),
});

class MarketController {
   // GET /market/quote/:symbol
  async getQuote(req: Request, res: Response): Promise<void> {
    try {
      const { symbol } = symbolSchema.parse(req.params);
      const quote = await marketDataService.getQuote(symbol);
      res.json({
        data: quote,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid symbol',
          details: error.issues,
        });
        return;
      }

      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
        return;
      }

      console.error('Get quote error:', error);
      res.status(500).json({ error: 'Failed to fetch quote' });
    }
  }

   // POST /market/quotes
  async getMultipleQuotes(req: Request, res: Response): Promise<void> {
    try {
      const { symbols } = multipleSymbolsSchema.parse(req.body);
      const quotes = await marketDataService.getMultipleQuotes(symbols);
      res.json({
        data: quotes,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid request',
          details: error.issues,
        });
        return;
      }
      console.error('Get multiple quotes error:', error);
      res.status(500).json({ error: 'Failed to fetch quotes' });
    }
  }

   // GET /market/search?q=apple
  async search(req: Request, res: Response): Promise<void> {
    try {
      const { q } = searchSchema.parse(req.query);
      const results = await marketDataService.searchInstruments(q);
      res.json({
        data: results,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid search query',
          details: error.issues,
        });
        return;
      }
      console.error('Search error:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  }
}

export default new MarketController();