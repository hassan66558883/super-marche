import { Router } from 'express';
import authRoutes from './auth.routes.js';
import { notificationRoutes, settingsRoutes } from './misc.routes.js';

const api = Router();
api.use('/auth', authRoutes);
api.use('/settings', settingsRoutes);
api.use('/notifications', notificationRoutes);
export default api;
