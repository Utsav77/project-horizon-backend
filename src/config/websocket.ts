import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthenticatedSocket extends Socket {
  userId?: number;
}

export function initializeWebSocket(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use((socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }
      
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
      socket.userId = decoded.userId;
      console.log(`User ${decoded.userId} authenticated on WebSocket`);
      next();
    } catch (error) {
      console.error('WebSocket authentication failed:', error);
      next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`Client connected: ${socket.id} (User: ${socket.userId})`);
    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected: ${socket.id} (Reason: ${reason})`);
    });

    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  });

  return io;
}