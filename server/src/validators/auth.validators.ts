import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'Au moins 8 caractères')
  .max(128)
  .regex(/[A-Za-z]/, 'Doit contenir une lettre')
  .regex(/[0-9]/, 'Doit contenir un chiffre');

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Identifiant requis').max(120),
  password: z.string().min(1, 'Mot de passe requis').max(128),
  rememberMe: z.boolean().optional().default(false),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({ identifier: z.string().trim().min(1).max(120) });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), newPassword: passwordSchema });

export const preferencesSchema = z.object({
  locale: z.enum(['fr', 'ar', 'en']).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  defaultBranchId: z.string().uuid().optional(),
});
