import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import redisClient from '../config/redis';
import { RegisterInput, LoginInput } from '../utils/validation';

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_REDIS_TTL = 7 * 24 * 60 * 60;

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

interface User {
  id: number;
  email: string;
  password_hash: string;
  email_verified: boolean;
  created_at: Date;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  async register(data: RegisterInput): Promise<{ userId: number; email: string }> {
    const { email, password } = data;

    const existingUser = await pool.query<User>(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query<User>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    );
    const user = result.rows[0];

    return {
      userId: user.id,
      email: user.email,
    };
  }

  async login(data: LoginInput): Promise<TokenPair & { userId: number; email: string }> {
    const { email, password } = data;

    // Find user
    const result = await pool.query<User>(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    const tokens = await this.generateTokenPair(user.id);

    return {
      ...tokens,
      userId: user.id,
      email: user.email,
    };
  }

  private async generateTokenPair(userId: number): Promise<TokenPair> {
    const accessToken = jwt.sign({ userId }, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = jwt.sign({ userId }, JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 1);
    await redisClient.setEx(
      `refresh_token:${userId}`,
      REFRESH_TOKEN_REDIS_TTL,
      hashedRefreshToken
    );

    return { accessToken, refreshToken };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { userId: number };

      // Check if refresh token exists in Redis
      const storedToken = await redisClient.get(`refresh_token:${decoded.userId}`);

      if (!storedToken) {
        throw new Error('Refresh token not found or expired');
      }

      const isValid = await bcrypt.compare(refreshToken, storedToken);

      if (!isValid) {
        throw new Error('Invalid refresh token');
      }

      // Generate new access token
      const accessToken = jwt.sign({ userId: decoded.userId }, JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
      });

      return { accessToken };
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      }
      throw error;
    }
  }

  async logout(userId: number): Promise<void> {
    // Delete refresh token from Redis
    await redisClient.del(`refresh_token:${userId}`);
  }

  verifyAccessToken(token: string): number {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
      return decoded.userId;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }
}

export default new AuthService();