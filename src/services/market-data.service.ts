import axios from 'axios';
import { upsertInstrument, getInstrumentBySymbol } from '../models/instrument.model';
import stockSimulator from '../utils/stock-simulator';

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  volume: number;
  timestamp: number;
  dataSource: 'finnhub' | 'alphavantage' | 'mock';
  isRealTime: boolean; 
}

class MarketDataService {
  /**
   * Get current quote for a symbol
   * Tries Finnhub first(60 req/min), falls back to Alpha Vantage(5 req/min), then mock data
   */
  async getQuote(symbol: string): Promise<Quote> {
    try {
      return await this.getQuoteFromFinnhub(symbol);
    } catch (error) {
      console.warn(`Finnhub failed for ${symbol}, trying Alpha Vantage...`, error);
      
      try {
        return await this.getQuoteFromAlphaVantage(symbol);
      } catch (error2) {
        console.warn(`Alpha Vantage failed for ${symbol}, using mock data...`, error2);
        return this.getMockQuote(symbol);
      }
    }
  }

  // Fetch quote from Finnhub
  private async getQuoteFromFinnhub(symbol: string): Promise<Quote> {
    const response = await axios.get('https://finnhub.io/api/v1/quote', {
      params: {
        symbol: symbol.toUpperCase(),
        token: FINNHUB_KEY,
      },
      timeout: 5000,
    });

    const data = response.data;
    // Finnhub returns 0 for all fields if symbol invalid
    if (data.c === 0 && data.pc === 0) {
      throw new Error(`Invalid symbol or no data: ${symbol}`);
    }

    const price = data.c;
    const previousClose = data.pc;
    const change = price - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol: symbol.toUpperCase(),
      price,
      change,
      changePercent,
      high: data.h,
      low: data.l,
      open: data.o,
      previousClose,
      volume: 0, // Finnhub doesn't provide volume in quote endpoint
      timestamp: Date.now(),
      dataSource: 'finnhub', 
      isRealTime: true
    };
  }

   // Fetch quote from Alpha Vantage
  private async getQuoteFromAlphaVantage(symbol: string): Promise<Quote> {
    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'GLOBAL_QUOTE',
        symbol: symbol.toUpperCase(),
        apikey: ALPHA_VANTAGE_KEY,
      },
      timeout: 5000,
    });

    const data = response.data['Global Quote'];
    if (!data || Object.keys(data).length === 0) {
      throw new Error(`Invalid symbol or API limit reached: ${symbol}`);
    }

    const price = parseFloat(data['05. price']);
    const previousClose = parseFloat(data['08. previous close']);
    const change = parseFloat(data['09. change']);
    const changePercent = parseFloat(data['10. change percent'].replace('%', ''));

    return {
      symbol: symbol.toUpperCase(),
      price,
      change,
      changePercent,
      high: parseFloat(data['03. high']),
      low: parseFloat(data['04. low']),
      open: parseFloat(data['02. open']),
      previousClose,
      volume: parseInt(data['06. volume']),
      timestamp: Date.now(),
      dataSource: 'alphavantage', 
      isRealTime: true
    };
  }

  private lastMockPrices: Map<string, number> = new Map();
   // Generate mock data
   private getMockQuote(symbol: string): Quote {
    const params = stockSimulator.getSymbolParameters(symbol);
    
    // Get last price or use base price
    const lastPrice = this.lastMockPrices.get(symbol) || params.basePrice;

    // Generate next price using GBM
    const price = stockSimulator.generateNextPrice(
      lastPrice,
      params.drift,
      params.volatility,
      1 / (252 * 78) // 1-minute intervals (252 trading days, 6.5 hours)
    );

    // Store for next call (creates continuous price path)
    this.lastMockPrices.set(symbol, price);

    const previousClose = params.basePrice;
    const change = price - previousClose;
    const changePercent = (change / previousClose) * 100;
    
    const open = previousClose * (1 + stockSimulator['randomNormal'](0, 0.005));
    const high = Math.max(price, open, lastPrice) * (1 + Math.random() * 0.005);
    const low = Math.min(price, open, lastPrice) * (1 - Math.random() * 0.005);

    return {
      symbol: symbol.toUpperCase(),
      price: parseFloat(price.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      open: parseFloat(open.toFixed(2)),
      previousClose: parseFloat(previousClose.toFixed(2)),
      volume: Math.floor(Math.random() * 10000000),
      timestamp: Date.now(),
      dataSource: 'mock',
      isRealTime: false
    };
  }

   // Get multiple quotes at once
  async getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
    const promises = symbols.map((symbol) => this.getQuote(symbol));
    return Promise.all(promises);
  }

   // Search for instruments by name or symbol
  async searchInstruments(query: string): Promise<Array<{ symbol: string; description: string }>> {
    try {
      const response = await axios.get('https://finnhub.io/api/v1/search', {
        params: {
          q: query,
          token: FINNHUB_KEY,
        },
      });

      return response.data.result.slice(0, 10).map((item: any) => ({
        symbol: item.symbol,
        description: item.description,
      }));
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

   // Store instrument metadata in database
  async saveInstrumentMetadata(symbol: string, name?: string): Promise<void> {
    try {
      const existing = await getInstrumentBySymbol(symbol);
      if (existing) return;
      if (!name) {
        const searchResults = await this.searchInstruments(symbol);
        name = searchResults[0]?.description || symbol;
      }

      await upsertInstrument({
        symbol: symbol.toUpperCase(),
        name,
        exchange: 'US',
      });

      console.log(`Saved instrument: ${symbol}`);
    } catch (error) {
      console.error(`Failed to save instrument ${symbol}:`, error);
    }
  }
}

export default new MarketDataService();