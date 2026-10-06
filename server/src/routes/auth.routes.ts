import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';

const r = Router();
r.post('/login', loginLimiter, AuthController.login);
r.post('/refresh', AuthController.refresh);
r.post('/logout', optionalAuth, AuthController.logout);
r.post('/forgot-password', loginLimiter, AuthController.forgotPassword);
r.post('/reset-password', loginLimiter, AuthController.resetPassword);
r.get('/me', authenticate, AuthController.me);
r.patch('/me/preferences', authenticate, AuthController.updatePreferences);
r.post('/change-password', authenticate, AuthController.changePassword);
r.get('/sessions', authenticate, AuthController.sessions);
r.delete('/sessions/:id', authenticate, AuthController.revokeSession);
export default r;
