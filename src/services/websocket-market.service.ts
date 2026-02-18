import { Server as SocketIOServer } from 'socket.io';
import { AuthenticatedSocket } from '../config/websocket';
import marketDataService from './market-data.service';
import redisClient from '../config/redis';

class WebSocketMarketService {
  private io: SocketIOServer | null = null;
  private subscribedSymbols: Set<string> = new Set();
  private redisSubscriber = redisClient.duplicate(); // Separate connection for subscribing

  async initialize(io: SocketIOServer): Promise<void> {
    this.io = io;
    await this.redisSubscriber.connect();
    console.log('Redis subscriber connected');

    this.redisSubscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        this.io?.to(channel).emit('price_update', data);
      } catch (error) {
        console.error('Error processing Redis message:', error);
      }
    });

    io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleSocketConnection(socket);
    });
  }

  private async addActiveSymbol(symbol: string): Promise<void> {
    await redisClient.sAdd('active_symbols', symbol);
  }

  private async removeActiveSymbol(symbol: string): Promise<void> {
    await redisClient.sRem('active_symbols', symbol);
  }

  async getActiveSymbols(): Promise<string[]> {
    try {
      const symbols = await redisClient.sMembers('active_symbols');
      return symbols;
    } catch (error) {
      console.error('Failed to get active symbols:', error);
      return [];
    }
  }

  // Update the subscribe handler:
  private handleSocketConnection(socket: AuthenticatedSocket): void {
    socket.on('subscribe', async (data: { symbol: string }) => {
      try {
        const symbol = data.symbol.toUpperCase();
        const room = `stock:${symbol}`;

        socket.join(room);
        console.log(`User ${socket.userId} subscribed to ${symbol}`);
        // If this is the first subscriber to this symbol
        if (!this.subscribedSymbols.has(symbol)) {
          await this.redisSubscriber.subscribe(room, (message) => {});
          this.subscribedSymbols.add(symbol);
          
          // Track in Redis so background job knows to fetch prices
          await this.addActiveSymbol(symbol);
          console.log(`Subscribed to Redis channel: ${room}`);
        }

        // Send initial price immediately
        const quote = await marketDataService.getQuote(symbol);
        socket.emit('price_update', quote);
        socket.emit('subscribed', { symbol, room });

      } catch (error) {
        console.error('Subscribe error:', error);
        socket.emit('error', { message: 'Failed to subscribe to symbol' });
      }
    });

    socket.on('unsubscribe', async (data: { symbol: string }) => {
      try {
        const symbol = data.symbol.toUpperCase();
        const room = `stock:${symbol}`;

        socket.leave(room);
        console.log(`User ${socket.userId} unsubscribed from ${symbol}`);

        // Check if any other sockets are still in this room
        const socketsInRoom = await this.io?.in(room).fetchSockets();
        
        // If no one else is subscribed, unsubscribe from Redis
        if (!socketsInRoom || socketsInRoom.length === 0) {
          await this.redisSubscriber.unsubscribe(room);
          this.subscribedSymbols.delete(symbol);
          // Remove from active symbols
          await this.removeActiveSymbol(symbol);
          console.log(`Unsubscribed from Redis channel: ${room}`);
        }

        socket.emit('unsubscribed', { symbol });

      } catch (error) {
        console.error('Unsubscribe error:', error);
        socket.emit('error', { message: 'Failed to unsubscribe from symbol' });
      }
    });

    socket.on('get_subscriptions', () => {
      // Get all rooms this socket is in (excluding the default room which is the socket ID)
      const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);
      const symbols = rooms.map(room => room.replace('stock:', ''));
      socket.emit('subscriptions', { symbols });
    });

    socket.on('disconnect', async () => {
      console.log(`User ${socket.userId} disconnected from market data`);
    });
  }
  
  async publishPriceUpdate(symbol: string, quote: any): Promise<void> {
    try {
      const room = `stock:${symbol}`;
      // All WebSocket servers subscribed to this channel will receive it
      await redisClient.publish(room, JSON.stringify(quote));
    } catch (error) {
      console.error(`Failed to publish price update for ${symbol}:`, error);
    }
  }
}

export default new WebSocketMarketService();