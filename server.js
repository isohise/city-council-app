import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

import db, { init as initDb, getUserByUsername, createUser } from './db.js';

// Маршруты
import authRoutes from './routes/authRoutes.js';
import memberRoutes from './routes/memberRoutes.js';
import commissionRoutes from './routes/commissionRoutes.js';
import meetingRoutes from './routes/meetingRoutes.js';
import statsRoutes from './routes/statsRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- базовые миддлвары ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- инициализация БД ---
initDb();

// --- авто-создание дефолтных пользователей, если их нет ---
async function ensureDefaultUsers() {
  try {
    const admin = getUserByUsername('admin');
    const user = getUserByUsername('user');
    if (!admin) {
      const hash = await bcrypt.hash('qwerty', 10);
      createUser({ username: 'admin', password_hash: hash, role: 'admin' });
      console.log('Создан пользователь admin / qwerty');
    }
    if (!user) {
      const hash = await bcrypt.hash('qwerty', 10);
      createUser({ username: 'user', password_hash: hash, role: 'user' });
      console.log('Создан пользователь user / qwerty');
    }
  } catch (e) {
    console.error('Не удалось создать дефолтных пользователей:', e);
  }
}
ensureDefaultUsers();

// --- API ---
app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/stats', statsRoutes);

// --- статика фронта ---
const __dirname = process.cwd();
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// healthcheck
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// отдаём SPA
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

// --- обработка ошибок ---
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  const code = err.status || 500;
  res.status(code).json({
    error: err.message || 'Server error',
    code
  });
});

app.listen(PORT, () => {
  console.log(`City Council app running on http://localhost:${PORT}`);
  console.log(`Логин: admin / qwerty  или  user / qwerty`);
});

export default app;
