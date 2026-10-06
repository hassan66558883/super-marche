import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const skip = () => env.isTest;

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { success: false, message: 'Trop de requêtes, réessayez dans un instant', code: 'RATE_LIMITED' },
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { success: false, message: 'Trop de tentatives de connexion, réessayez plus tard', code: 'RATE_LIMITED' },
});
