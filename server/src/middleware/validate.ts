import type { Request } from 'express';
import type { ZodTypeAny, z } from 'zod';

/** Parse helpers used by controllers. Throw ZodError → centralized 400 response. */
export const parseBody = <S extends ZodTypeAny>(schema: S, req: Request): z.infer<S> => schema.parse(req.body);
export const parseQuery = <S extends ZodTypeAny>(schema: S, req: Request): z.infer<S> => schema.parse(req.query);
