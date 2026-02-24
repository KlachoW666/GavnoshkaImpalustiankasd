/**
 * Публичный API новостей для главной страницы (только опубликованные).
 */

import { Router, Request, Response } from 'express';
import { listPublishedNews } from '../db/newsDb';

const router = Router();

/** GET /api/news — список опубликованных новостей (для главной). */
router.get('/', (_req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(_req.query.limit), 10) || 20, 50);
    const items = listPublishedNews(limit);
    res.json({ news: items });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load news', news: [] });
  }
});

export default router;
