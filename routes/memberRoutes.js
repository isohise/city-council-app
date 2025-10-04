// routes/memberRoutes.js
import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import {
  listMembers,
  createMember,
  getMember,
  getMemberCommissions,
  updateMember,
  deleteMember
} from '../db.js';

const router = Router();

// Все эндпоинты защищены авторизацией
router.use(requireAuth);

/** Список всех членов */
router.get('/', (_req, res) => {
  res.json(listMembers());
});

/** Комиссии/председательства конкретного члена (ставим ДО общего :id) */
router.get('/:id(\\d+)/commissions', (req, res) => {
  const id = Number(req.params.id);
  const member = getMember(id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json(getMemberCommissions(id));
});

/** Карточка члена */
router.get('/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const member = getMember(id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  const meta = getMemberCommissions(id);
  res.json({ ...member, ...meta });
});

/** Создать члена (admin) */
router.post('/', requireRole('admin'), (req, res) => {
  const { full_name, address = null, home_phone = null, work_phone = null } = req.body || {};
  if (!full_name || typeof full_name !== 'string') {
    return res.status(400).json({ error: 'full_name is required' });
  }
  const id = createMember({ full_name, address, home_phone, work_phone });
  res.status(201).json(getMember(id));
});

/** Обновить члена (admin) */
router.patch('/:id(\\d+)', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!getMember(id)) return res.status(404).json({ error: 'Member not found' });
  const result = updateMember(id, req.body || {});
  if (!result.changes) return res.status(400).json({ error: 'Nothing to update' });
  res.json(getMember(id));
});

/** Удалить члена (admin) */
router.delete('/:id(\\d+)', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!getMember(id)) return res.status(404).json({ error: 'Member not found' });
  deleteMember(id);
  res.json({ ok: true, id });
});

export default router;