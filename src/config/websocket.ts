import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

/**
 * 📚 SENIOR CONCEPT: WebSocket Authentication
 * 
 * Unlike HTTP (where each request has auth header), WebSocket establishes
 * ONE connection that stays open. We need to authenticate on connection,
 * then trust the socket for subsequent messages.
 * 
 * Security considerations:
 * - Verify JWT on initial connection
 * - Store userId in socket metadata
 * - Optionally re-verify periodically (token expiry)
 * - Handle disconnection/reconnection properly
 */

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthenticatedSocket extends Socket {
  userId?: number; // Added after authentication
}

/**
 * Initialize Socket.io server
 */
export function initializeWebSocket(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || '*', // In production, set specific domain
      credentials: true,
    },
    // 📚 STAFF CONCEPT: Transports
    // Socket.io tries WebSocket first, falls back to HTTP polling if blocked
    transports: ['websocket', 'polling'],
  });

  /**
   * Authentication Middleware
   * Runs before 'connection' event
   */
  io.use((socket: AuthenticatedSocket, next) => {
    try {
      // Client sends token in handshake auth object
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };

      // Attach userId to socket for later use
      socket.userId = decoded.userId;

      console.log(`✅ User ${decoded.userId} authenticated on WebSocket`);
      next();
    } catch (error) {
      console.error('WebSocket authentication failed:', error);
      next(new Error('Invalid authentication token'));
    }
  });

  /**
   * Connection handler
   */
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`🔌 Client connected: ${socket.id} (User: ${socket.userId})`);

    /**
     * 📚 SENIOR CONCEPT: Event-driven architecture
     * 
     * Client emits events → Server handles them
     * Server emits events → Client handles them
     * 
     * Unlike REST (fixed endpoints), WebSocket uses custom event names
     */

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Client disconnected: ${socket.id} (Reason: ${reason})`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${socket.id}:`, error);
    });
  });

  return io;
}