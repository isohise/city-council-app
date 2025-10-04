// routes/commissionRoutes.js
import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import {
  listCommissions,
  getCommission,
  createCommission,
  updateCommission,
  deleteCommission,
  getCommissionMembers,
  addMemberToCommission,
  updateMemberLeaveDate,
  removeMemberFromCommission,
  setCommissionChair,
  getChairsHistory,
  existsMember,
  existsCommission
} from '../db.js';

const router = Router();
router.use(requireAuth);

/** Список комиссий */
router.get('/', (_req, res) => res.json(listCommissions()));

/** История председателей */
router.get('/:id(\\d+)/chairs', (req, res) => {
  const id = Number(req.params.id);
  if (!existsCommission(id)) return res.status(404).json({ error: 'Commission not found' });
  res.json(getChairsHistory(id));
});

/** Состав комиссии */
router.get('/:id(\\d+)/members', (req, res) => {
  const id = Number(req.params.id);
  if (!existsCommission(id)) return res.status(404).json({ error: 'Commission not found' });
  res.json(getCommissionMembers(id));
});

/** Удалить участника из комиссии (admin) */
router.delete('/:id(\\d+)/members/:member_id(\\d+)', requireRole('admin'), (req, res) => {
  const commission_id = Number(req.params.id);
  const member_id = Number(req.params.member_id);
  if (!existsCommission(commission_id)) return res.status(404).json({ error: 'Commission not found' });
  if (!existsMember(member_id)) return res.status(404).json({ error: 'Member not found' });
  removeMemberFromCommission({ commission_id, member_id });
  res.json({ ok: true, commission_id, member_id });
});

/** Карточка комиссии */
router.get('/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const commission = getCommission(id);
  if (!commission) return res.status(404).json({ error: 'Commission not found' });
  res.json(commission);
});

/** Создать комиссию (admin) */
router.post('/', requireRole('admin'), (req, res) => {
  const { name, profile = null, description = null, chair_id = null, chair_start_date = null } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  const id = createCommission({ name, profile, description });
  if (chair_id) {
    if (!existsMember(Number(chair_id))) return res.status(400).json({ error: 'chair_id does not exist' });
    const start_date = chair_start_date || new Date().toISOString().slice(0, 10);
    setCommissionChair({ commission_id: id, member_id: Number(chair_id), start_date });
  }
  res.status(201).json(getCommission(id));
});

/** Обновить комиссию (admin) */
router.patch('/:id(\\d+)', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!existsCommission(id)) return res.status(404).json({ error: 'Commission not found' });
  const result = updateCommission(id, req.body || {});
  if (!result.changes) return res.status(400).json({ error: 'Nothing to update' });
  res.json(getCommission(id));
});

/** Удалить комиссию (admin) */
router.delete('/:id(\\d+)', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!existsCommission(id)) return res.status(404).json({ error: 'Commission not found' });
  deleteCommission(id);
  res.json({ ok: true, id });
});

/** Добавить участника (admin) */
router.post('/:id(\\d+)/members', requireRole('admin'), (req, res) => {
  const commission_id = Number(req.params.id);
  if (!existsCommission(commission_id)) return res.status(404).json({ error: 'Commission not found' });
  const { member_id, joined_at, left_at = null } = req.body || {};
  if (!member_id || !joined_at) return res.status(400).json({ error: 'member_id and joined_at are required' });
  if (!existsMember(Number(member_id))) return res.status(400).json({ error: 'member_id does not exist' });
  addMemberToCommission({ commission_id, member_id: Number(member_id), joined_at, left_at });
  res.status(201).json(getCommissionMembers(commission_id));
});

/** Поставить дату выхода участника (admin) */
router.patch('/:id(\\d+)/members/:member_id(\\d+)/leave', requireRole('admin'), (req, res) => {
  const commission_id = Number(req.params.id);
  const member_id = Number(req.params.member_id);
  const { left_at } = req.body || {};
  if (!existsCommission(commission_id)) return res.status(404).json({ error: 'Commission not found' });
  if (!existsMember(member_id)) return res.status(404).json({ error: 'Member not found' });
  if (!left_at) return res.status(400).json({ error: 'left_at is required' });
  updateMemberLeaveDate({ commission_id, member_id, left_at });
  res.json(getCommissionMembers(commission_id));
});

/** Назначить председателя (admin) */
router.post('/:id(\\d+)/chair', requireRole('admin'), (req, res) => {
  const commission_id = Number(req.params.id);
  const { member_id, start_date } = req.body || {};
  if (!existsCommission(commission_id)) return res.status(404).json({ error: 'Commission not found' });
  if (!member_id || !start_date) return res.status(400).json({ error: 'member_id and start_date are required' });
  if (!existsMember(Number(member_id))) return res.status(400).json({ error: 'member_id does not exist' });
  setCommissionChair({ commission_id, member_id: Number(member_id), start_date });
  res.json(getCommission(commission_id));
});

export default router;
