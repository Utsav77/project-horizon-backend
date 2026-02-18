import cron from 'node-cron';
import { ScheduledTask } from 'node-cron'; 
import marketDataService from './market-data.service';
import websocketMarketService from './websocket-market.service';
import redisClient from '../config/redis';

class PriceUpdaterService {
  private updateJob: ScheduledTask | null = null;
  private isRunning: boolean = false;
  private readonly MAX_SYMBOLS_PER_UPDATE = 5; // Finnhub rate limit consideration
  private readonly UPDATE_INTERVAL_SECONDS = 5;

  start(): void {
    if (this.isRunning) {
      console.log('Price updater already running');
      return;
    }
    console.log(`Starting price updater (every ${this.UPDATE_INTERVAL_SECONDS} seconds)`);

    // Schedule job: runs every 5 seconds
    this.updateJob = cron.schedule(`*/${this.UPDATE_INTERVAL_SECONDS} * * * * *`, async () => {
      await this.updatePrices();
    });
    this.isRunning = true;
    console.log('Price updater started');
  }

  stop(): void {
    if (this.updateJob) {
      this.updateJob.stop();
      this.isRunning = false;
      console.log('Price updater stopped');
    }
  }

  private async updatePrices(): Promise<void> {
    try {
      // Get list of symbols users are currently subscribed to
      const activeSymbols = await this.getActiveSymbols();
      if (activeSymbols.length === 0) {
        return;
      }
      console.log(`Updating prices for ${activeSymbols.length} symbols:`, activeSymbols.join(', '));

      // Fetch prices for all active symbols (with concurrency limit)
      const symbolsToFetch = activeSymbols.slice(0, this.MAX_SYMBOLS_PER_UPDATE);
      const promises = symbolsToFetch.map(symbol => this.fetchAndPublish(symbol));

      const results = await Promise.allSettled(promises);

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      if (failed > 0) {
        console.warn(`Price update: ${successful} succeeded, ${failed} failed`);
      }

    } catch (error) {
      console.error('Error in price update loop:', error);
    }
  }

  private async fetchAndPublish(symbol: string): Promise<void> {
    try {
      // Fetch current price (uses Finnhub or mock data as fallback)
      const quote = await marketDataService.getQuote(symbol);

      // All WebSocket servers subscribed to "stock:AAPL" will receive this
      await websocketMarketService.publishPriceUpdate(symbol, quote);

      // cache in Redis for HTTP API calls
      await redisClient.setEx(
        `quote:${symbol}`,
        10, // Cache for 10 seconds (longer than update interval)
        JSON.stringify(quote)
      );

    } catch (error) {
      console.error(`Failed to fetch/publish ${symbol}:`, error);
      throw error;
    }
  }

  private async getActiveSymbols(): Promise<string[]> {
    // Use the WebSocket service method instead
    return await websocketMarketService.getActiveSymbols();
  }


  async shutdown(): Promise<void> {
    console.log('Shutting down price updater...');
    this.stop();
    // Wait for any in-progress updates to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Price updater shutdown complete');
  }
}

export default new PriceUpdaterService();