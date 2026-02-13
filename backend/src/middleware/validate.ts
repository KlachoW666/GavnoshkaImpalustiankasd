/**
 * Валидация тела запроса через Zod. При ошибке возвращает 400 с текстом.
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (result.success) {
      (req as any).validatedBody = result.data;
      next();
      return;
    }
    const first = result.error.issues[0];
    const message = first ? `${first.path.join('.')}: ${first.message}` : 'Неверные данные';
    res.status(400).json({ error: message });
  };
}
