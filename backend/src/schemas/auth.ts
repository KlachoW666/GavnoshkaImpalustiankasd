import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(2, 'Логин от 2 символов').max(64).transform((s) => s.trim()),
  password: z.string().min(4, 'Пароль от 4 символов')
});

export const loginSchema = z.object({
  username: z.string().min(1, 'Логин обязателен').transform((s) => s.trim()),
  password: z.string().min(1, 'Пароль обязателен')
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
