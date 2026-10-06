import { toast } from 'sonner';
import i18n from '@/i18n';
import { ApiError } from '@/services/api';

/** User-facing message for any error: translated by code when we have one, else the server message. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    if (i18n.exists(key)) return i18n.t(key);
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details) && err.details.length) {
      const first = err.details[0] as { path?: string; message?: string };
      return `${err.message}: ${first.path ? first.path + ' — ' : ''}${first.message ?? ''}`;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return i18n.t('errors.INTERNAL_ERROR');
}

export const toastError = (err: unknown) => toast.error(errorMessage(err));
