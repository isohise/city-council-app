import bcrypt from 'bcryptjs';
import db, {
  init as initDb,
  createUser,
  getUserByUsername,
  createMember,
  createCommission,
  addMemberToCommission,
  setCommissionChair,
  createMeeting,
  setAttendance
} from './db.js';

function clearAll() {
  // Чистим таблицы в корректном порядке (с учётом внешних ключей)
  db.init?.(); // на случай, если кто-то импортировал как default с методами
  // Отключаем FK ради упрощения очистки
  db.init && db.init();
}

function wipeTables() {
  // manual cleanup (foreign keys cascade already set)
  const exec = (sql) => db.run?.(sql) || null;
  try {
    exec('PRAGMA foreign_keys = OFF');
    exec('DELETE FROM attendance');
    exec('DELETE FROM meetings');
    exec('DELETE FROM commission_chairs');
    exec('DELETE FROM commission_members');
    exec('DELETE FROM commissions');
    exec('DELETE FROM members');
    exec('DELETE FROM users');
  } finally {
    exec('PRAGMA foreign_keys = ON');
  }
}

async function ensureUsers() {
  const adminExists = getUserByUsername('admin');
  const userExists = getUserByUsername('user');

  const adminHash = await bcrypt.hash('qwerty', 10);
  const userHash = await bcrypt.hash('qwerty', 10);

  if (!adminExists) {
    createUser({ username: 'admin', password_hash: adminHash, role: 'admin' });
  }
  if (!userExists) {
    createUser({ username: 'user', password_hash: userHash, role: 'user' });
  }
}

function seedData() {
  // --- Члены муниципалитета ---
  const mAlice = createMember({
    full_name: 'Алиса Петрова',
    address: 'ул. Лесная, 12',
    home_phone: '111-11-11',
    work_phone: '555-10-01'
  });
  const mBoris = createMember({
    full_name: 'Борис Иванов',
    address: 'пр-т Мира, 5',
    home_phone: '222-22-22',
    work_phone: '555-10-02'
  });
  const mClara = createMember({
    full_name: 'Клара Соколова',
    address: 'ул. Центральная, 7',
    home_phone: '333-33-33',
    work_phone: '555-10-03'
  });
  const mDenis = createMember({
    full_name: 'Денис Орлов',
    address: 'ул. Парковая, 21',
    home_phone: '444-44-44',
    work_phone: '555-10-04'
  });

  // --- Комиссии ---
  const cBudget = createCommission({
    name: 'Бюджет и финансы',
    profile: 'Финансовые вопросы, бюджет города',
    description: 'Рассмотрение и контроль исполнения бюджета.'
  });
  const cUrban = createCommission({
    name: 'Градостроительство',
    profile: 'Планирование и земля',
    description: 'Вопросы застройки, планировки, использования земель.'
  });

  // --- Состав комиссий (историчность 10 лет поддерживается датами) ---
  addMemberToCommission({ commission_id: cBudget, member_id: mAlice, joined_at: '2022-01-15' });
  addMemberToCommission({ commission_id: cBudget, member_id: mBoris, joined_at: '2022-01-15' });
  addMemberToCommission({ commission_id: cBudget, member_id: mClara, joined_at: '2023-03-01' });

  addMemberToCommission({ commission_id: cUrban, member_id: mBoris, joined_at: '2021-09-10' });
  addMemberToCommission({ commission_id: cUrban, member_id: mDenis, joined_at: '2021-09-10' });

  // --- Председатели (история) ---
  // Бюджет: Алиса председатель с 2023-01-01
  setCommissionChair({ commission_id: cBudget, member_id: mAlice, start_date: '2023-01-01' });
  // Градостроительство: Борис с 2022-05-01
  setCommissionChair({ commission_id: cUrban, member_id: mBoris, start_date: '2022-05-01' });

  // --- Заседания и посещаемость (примерные данные за 2024 год) ---
  const mtg1 = createMeeting({
    commission_id: cBudget,
    held_at: '2024-02-10T10:00',
    place: 'Зал 1'
  });
  setAttendance(mtg1, [
    { member_id: mAlice, present: true },
    { member_id: mBoris, present: true },
    { member_id: mClara, present: false }
  ]);

  const mtg2 = createMeeting({
    commission_id: cBudget,
    held_at: '2024-04-05T10:00',
    place: 'Зал 1'
  });
  setAttendance(mtg2, [
    { member_id: mAlice, present: true },
    { member_id: mBoris, present: false },
    { member_id: mClara, present: true }
  ]);

  const mtg3 = createMeeting({
    commission_id: cUrban,
    held_at: '2024-03-12T15:00',
    place: 'Зал 2'
  });
  setAttendance(mtg3, [
    { member_id: mBoris, present: true },
    { member_id: mDenis, present: true }
  ]);

  const mtg4 = createMeeting({
    commission_id: cUrban,
    held_at: '2024-06-20T15:00',
    place: 'Зал 2'
  });
  setAttendance(mtg4, [
    { member_id: mBoris, present: false },
    { member_id: mDenis, present: true }
  ]);

  // Пара свежих заседаний 2025 для отчётов
  const mtg5 = createMeeting({
    commission_id: cBudget,
    held_at: '2025-01-18T11:00',
    place: 'Зал 1'
  });
  setAttendance(mtg5, [
    { member_id: mAlice, present: true },
    { member_id: mBoris, present: true },
    { member_id: mClara, present: true }
  ]);

  const mtg6 = createMeeting({
    commission_id: cUrban,
    held_at: '2025-02-14T16:00',
    place: 'Зал 2'
  });
  setAttendance(mtg6, [
    { member_id: mBoris, present: true },
    { member_id: mDenis, present: false }
  ]);
}

async function main() {
  console.log('Инициализация БД...');
  initDb();

  const wipe = process.env.WIPE === '1';
  if (wipe) {
    console.log('Очистка таблиц...');
    wipeTables();
  }

  console.log('Создание пользователей...');
  await ensureUsers();

  console.log('Наполнение тестовыми данными...');
  seedData();

  console.log('Готово! Пользователи:');
  console.log('  admin / qwerty  (роль: admin)');
  console.log('  user  / qwerty  (роль: user)');
}

main().catch((e) => {
  console.error('Seed error:', e);
  process.exit(1);
});
