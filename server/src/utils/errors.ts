export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentification requise', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);
export const forbidden = (message = 'Accès refusé', code = 'FORBIDDEN') => new AppError(403, code, message);
export const notFound = (code: string, message: string) => new AppError(404, code, message);
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(422, code, message, details);
