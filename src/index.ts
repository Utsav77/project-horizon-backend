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
import priceUpdaterService from './services/price-updater.service';

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


async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n ${signal} received, starting graceful shutdown...`);

  // If cleanup hangs, we need to die anyway (Docker/K8s will SIGKILL us)
  // Better to exit on our terms than be killed
  const forceExitTimeout = setTimeout(() => {
    console.error('Graceful shutdown timeout exceeded (10s), forcing exit');
    process.exit(1); // Exit code 1 = abnormal termination
  }, 10000);

  try {
    // 1. Stop accepting new HTTP requests
    console.log('Closing HTTP server...');
    await new Promise<void>((resolve) => {
      httpServer.close(() => {
        console.log('HTTP server closed');
        resolve();
      });
    });

    // 2. Stop background jobs
    console.log('Stopping price updater...');
    await priceUpdaterService.shutdown();
    console.log('Price updater stopped');

    // 3. Close WebSocket connections gracefully
    console.log('Closing WebSocket connections...');
    // Socket.io will close all connections when server closes
    
    // 4. Close database connection pool
    console.log('Closing database connections...');
    await pool.end();
    console.log('Database connections closed');

    // 5. Close Redis connections
    console.log('Closing Redis connections...');
    await redisClient.quit();
    console.log('Redis connections closed');

    // Cancel force exit and exit cleanly
    clearTimeout(forceExitTimeout);
    console.log('Graceful shutdown complete');
    process.exit(0); // Exit code 0 = success

  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    clearTimeout(forceExitTimeout);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 📚 Uncaught errors should also trigger shutdown
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

const startServer = async () => {
  try {
    await connectRedis();
    await createUsersTable();
    await createInstrumentsTable();

    const io = initializeWebSocket(httpServer);
    console.log('WebSocket server initialized');

    await websocketMarketService.initialize(io);
    console.log('WebSocket market service initialized');

    priceUpdaterService.start();
    console.log('Price updater started');

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