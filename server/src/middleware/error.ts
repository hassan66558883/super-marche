import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ success: false, message: `Route introuvable: ${req.method} ${req.path}`, code: 'ROUTE_NOT_FOUND' });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ success: false, message: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Données invalides',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | string | undefined) ?? '';
      res.status(409).json({ success: false, message: `Valeur déjà utilisée (${String(target)})`, code: 'DUPLICATE_VALUE', details: { target } });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Enregistrement introuvable', code: 'NOT_FOUND' });
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json({ success: false, message: 'Enregistrement lié à d’autres données', code: 'FOREIGN_KEY_CONSTRAINT' });
      return;
    }
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: 'JSON invalide', code: 'INVALID_JSON' });
    return;
  }
  // Append-only trigger violation surfaces as a raw DB error
  if (String(err?.message ?? '').includes('is append-only')) {
    res.status(409).json({ success: false, message: 'Les données financières ne peuvent pas être supprimées', code: 'IMMUTABLE_RECORD' });
    return;
  }
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({ success: false, message: 'Erreur interne du serveur', code: 'INTERNAL_ERROR' });
};
