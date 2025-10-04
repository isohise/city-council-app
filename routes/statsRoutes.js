import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  getAbsencesByCommission,
  getMeetingsCountByCommission,
  existsCommission
} from '../db.js';

const router = Router();

// Все отчёты доступны авторизованным пользователям (и admin, и user)
router.use(requireAuth);

/**
 * GET /api/stats/commission/:commission_id/absences?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Отчёт по комиссии за интервал дат:
 *   для каждого члена — всего заседаний, посещено, пропущено
 */
router.get('/commission/:commission_id/absences', (req, res) => {
  const commission_id = Number(req.params.commission_id);
  const { from, to } = req.query || {};

  if (!existsCommission(commission_id)) {
    return res.status(404).json({ error: 'Commission not found' });
  }
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to (YYYY-MM-DD) are required' });
  }

  const rows = getAbsencesByCommission(commission_id, String(from), String(to));
  res.json({
    commission_id,
    from: String(from),
    to: String(to),
    results: rows
  });
});

/**
 * GET /api/stats/meetings-count?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Количество проведённых заседаний по каждой комиссии за период
 */
router.get('/meetings-count', (req, res) => {
  const { from, to } = req.query || {};
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to (YYYY-MM-DD) are required' });
  }
  const rows = getMeetingsCountByCommission(String(from), String(to));
  res.json({
    from: String(from),
    to: String(to),
    commissions: rows
  });
});

export default router;
