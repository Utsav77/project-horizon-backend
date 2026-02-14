import express, { Express, Request, Response } from 'express';
import { createServer } from 'http';
import dotenv from 'dotenv';
import pool from './config/database';
import redisClient, { connectRedis } from './config/redis';
import { createUsersTable } from './models/user.model';
import { createInstrumentsTable } from './models/instrument.model';
import authRoutes from './routes/auth.routes';
import marketRoutes from './routes/market.routes';
import { initializeWebSocket } from './config/websocket';
import websocketMarketService from './services/websocket-market.service';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;
const httpServer = createServer(app);

app.use(express.json());

app.get('/health', async (req: Request, res: Response) => {
  try {
    const dbResult = await pool.query('SELECT NOW()');
    await redisClient.ping();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      redis: 'connected',
      dbTime: dbResult.rows[0].now,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.use('/auth', authRoutes);
app.use('/market', marketRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

const startServer = async () => {
  try {
    await connectRedis();
    await createUsersTable();
    await createInstrumentsTable();

    const io = initializeWebSocket(httpServer);
    console.log('WebSocket server initialized', io);

    await websocketMarketService.initialize(io);
    console.log('WebSocket market service initialized');

    httpServer.listen(port, () => {
      console.log(`Server running on port ${port}`);
      console.log(`API available at http://localhost:${port}`);
      console.log(`Auth endpoints at http://localhost:${port}/auth`);
      console.log(`WebSocket available at ws://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();