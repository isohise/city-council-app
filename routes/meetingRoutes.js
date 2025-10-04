// routes/meetingRoutes.js
import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import {
  createMeeting,
  updateMeeting,
  deleteMeeting,
  setAttendance,
  listMeetingsByCommission,
  getMeeting,
  existsCommission,
  existsMember,
  getCommissionMembers
} from '../db.js';

const router = Router();
router.use(requireAuth);

/** Список заседаний комиссии */
router.get('/commission/:commission_id(\\d+)', (req, res) => {
  const commission_id = Number(req.params.commission_id);
  if (!existsCommission(commission_id)) return res.status(404).json({ error: 'Commission not found' });
  const { from = null, to = null } = req.query || {};
  res.json(listMeetingsByCommission(commission_id, { from, to }));
});

/** Карточка заседания */
router.get('/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const mtg = getMeeting(id);
  if (!mtg) return res.status(404).json({ error: 'Meeting not found' });
  res.json(mtg);
});

/** Создать заседание (admin) */
router.post('/', requireRole('admin'), (req, res) => {
  const { commission_id, held_at, place, attendance = [] } = req.body || {};
  if (!commission_id || !held_at || !place) {
    return res.status(400).json({ error: 'commission_id, held_at and place are required' });
  }
  const cid = Number(commission_id);
  if (!existsCommission(cid)) return res.status(404).json({ error: 'Commission not found' });

  const id = createMeeting({ commission_id: cid, held_at, place });

  if (Array.isArray(attendance) && attendance.length > 0) {
    const members = new Set(getCommissionMembers(cid).map((m) => m.id));
    const filtered = attendance
      .filter((a) => a && typeof a.member_id !== 'undefined')
      .map((a) => ({ member_id: Number(a.member_id), present: !!a.present }))
      .filter((a) => members.has(a.member_id) && existsMember(a.member_id));
    if (filtered.length > 0) setAttendance(id, filtered);
  }

  res.status(201).json(getMeeting(id));
});

/** Обновить заседание (admin) */
router.patch('/:id(\\d+)', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!getMeeting(id)) return res.status(404).json({ error: 'Meeting not found' });
  const result = updateMeeting(id, req.body || {});
  if (!result.changes) return res.status(400).json({ error: 'Nothing to update' });
  res.json(getMeeting(id));
});

/** Обновить посещаемость (admin) */
router.put('/:id(\\d+)/attendance', requireRole('admin'), (req, res) => {
  const meeting_id = Number(req.params.id);
  const mtg = getMeeting(meeting_id);
  if (!mtg) return res.status(404).json({ error: 'Meeting not found' });

  const { attendance } = req.body || {};
  if (!Array.isArray(attendance)) return res.status(400).json({ error: 'attendance array is required' });

  const members = new Set(getCommissionMembers(mtg.commission_id).map((m) => m.id));
  const normalized = attendance
    .filter((a) => a && typeof a.member_id !== 'undefined')
    .map((a) => ({ member_id: Number(a.member_id), present: !!a.present }))
    .filter((a) => members.has(a.member_id) && existsMember(a.member_id));

  setAttendance(meeting_id, normalized);
  res.json(getMeeting(meeting_id));
});

/** Удалить заседание (admin) */
router.delete('/:id(\\d+)', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!getMeeting(id)) return res.status(404).json({ error: 'Meeting not found' });
  deleteMeeting(id);
  res.json({ ok: true, id });
});

export default router;
