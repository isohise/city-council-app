import { Router } from 'express';
import { handleLogin, handleMe, requireAuth } from '../auth.js';

const router = Router();

// POST /api/auth/login  { username, password }
router.post('/login', (req, res) => {
  handleLogin(req, res);
});

// GET /api/auth/me  (Bearer токен)
router.get('/me', requireAuth, (req, res) => {
  handleMe(req, res);
});

export default router;
