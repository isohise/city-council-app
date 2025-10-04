// db.js
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'council.db');
const db = new Database(DB_PATH);

// ---------- Helpers ----------
function run(sql, params = {}) {
  return db.prepare(sql).run(params);
}
function get(sql, params = {}) {
  return db.prepare(sql).get(params);
}
function all(sql, params = {}) {
  return db.prepare(sql).all(params);
}

// ---------- Init schema ----------
export function init() {
  db.pragma('journal_mode = WAL');

  run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin','user')) NOT NULL
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      address TEXT,
      home_phone TEXT,
      work_phone TEXT
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS commissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      profile TEXT,
      description TEXT
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS commission_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commission_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      joined_at TEXT NOT NULL,
      left_at TEXT,
      UNIQUE (commission_id, member_id, joined_at),
      FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS commission_chairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commission_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commission_id INTEGER NOT NULL,
      held_at TEXT NOT NULL,
      place TEXT NOT NULL,
      FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS attendance (
      meeting_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      present INTEGER NOT NULL CHECK (present IN (0,1)),
      PRIMARY KEY (meeting_id, member_id),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    )
  `);
}

// ---------- Users ----------
export function getUserByUsername(username) {
  return get(`SELECT * FROM users WHERE username=@username`, { username });
}
export function createUser({ username, password_hash, role }) {
  return run(
    `INSERT INTO users (username, password_hash, role)
     VALUES (@username, @password_hash, @role)`,
    { username, password_hash, role }
  );
}

// ---------- Members ----------
export function createMember({ full_name, address = null, home_phone = null, work_phone = null }) {
  const res = run(
    `INSERT INTO members (full_name, address, home_phone, work_phone)
     VALUES (@full_name, @address, @home_phone, @work_phone)`,
    { full_name, address, home_phone, work_phone }
  );
  return res.lastInsertRowid;
}
export function listMembers() {
  return all(`SELECT * FROM members ORDER BY full_name`);
}
export function getMember(id) {
  return get(`SELECT * FROM members WHERE id=@id`, { id });
}
export function updateMember(id, fields = {}) {
  const allowed = ['full_name', 'address', 'home_phone', 'work_phone'];
  const set = allowed.filter(k => k in fields).map(k => `${k}=@${k}`);
  if (!set.length) return { changes: 0 };
  return run(`UPDATE members SET ${set.join(', ')} WHERE id=@id`, { id, ...fields });
}
export function deleteMember(id) {
  return run(`DELETE FROM members WHERE id=@id`, { id });
}

// Список комиссий и периоды председательства для члена
export function getMemberCommissions(memberId) {
  const commissions = all(
    `
    SELECT c.id, c.name, c.profile,
           cm.joined_at, cm.left_at
    FROM commission_members cm
    JOIN commissions c ON c.id = cm.commission_id
    WHERE cm.member_id=@memberId
    ORDER BY c.name, cm.joined_at
    `,
    { memberId }
  );
  const chairs = all(
    `
    SELECT c.id AS commission_id, c.name, cc.start_date, cc.end_date
    FROM commission_chairs cc
    JOIN commissions c ON c.id = cc.commission_id
    WHERE cc.member_id=@memberId
    ORDER BY c.name, cc.start_date
    `,
    { memberId }
  );
  return { commissions, chairs };
}

// ---------- Commissions ----------
export function createCommission({ name, profile = null, description = null }) {
  const res = run(
    `INSERT INTO commissions (name, profile, description)
     VALUES (@name, @profile, @description)`,
    { name, profile, description }
  );
  return res.lastInsertRowid;
}
export function listCommissions() {
  const rows = all(`SELECT id, name, profile, description FROM commissions ORDER BY name`);
  return rows.map((c) => ({
    ...c,
    currentChair: getCurrentChair(c.id),
    members: getCommissionMembers(c.id)
  }));
}
export function getCommission(id) {
  const commission = get(
    `SELECT id, name, profile, description FROM commissions WHERE id=@id`,
    { id }
  );
  if (!commission) return null;
  commission.currentChair = getCurrentChair(id);
  commission.members = getCommissionMembers(id);
  return commission;
}
export function updateCommission(id, fields = {}) {
  const allowed = ['name', 'profile', 'description'];
  const set = allowed.filter(k => k in fields).map(k => `${k}=@${k}`);
  if (!set.length) return { changes: 0 };
  return run(`UPDATE commissions SET ${set.join(', ')} WHERE id=@id`, { id, ...fields });
}
export function deleteCommission(id) {
  return run(`DELETE FROM commissions WHERE id=@id`, { id });
}

export function addMemberToCommission({ commission_id, member_id, joined_at, left_at = null }) {
  const res = run(
    `INSERT INTO commission_members (commission_id, member_id, joined_at, left_at)
     VALUES (@commission_id, @member_id, @joined_at, @left_at)`,
    { commission_id, member_id, joined_at, left_at }
  );
  return res.lastInsertRowid;
}
export function updateMemberLeaveDate({ commission_id, member_id, left_at }) {
  return run(
    `UPDATE commission_members
     SET left_at=@left_at
     WHERE commission_id=@commission_id AND member_id=@member_id AND left_at IS NULL`,
    { commission_id, member_id, left_at }
  );
}
export function removeMemberFromCommission({ commission_id, member_id }) {
  return run(
    `DELETE FROM commission_members
     WHERE commission_id=@commission_id AND member_id=@member_id`,
    { commission_id, member_id }
  );
}
export function getCommissionMembers(commission_id) {
  return all(
    `
    SELECT m.id, m.full_name, cm.joined_at, cm.left_at
    FROM commission_members cm
    JOIN members m ON m.id = cm.member_id
    WHERE cm.commission_id=@commission_id
    ORDER BY m.full_name
    `,
    { commission_id }
  );
}

// ---------- Chairs ----------
export function setCommissionChair({ commission_id, member_id, start_date }) {
  run(
    `UPDATE commission_chairs
     SET end_date = @start_date
     WHERE commission_id=@commission_id AND end_date IS NULL`,
    { commission_id, start_date }
  );
  const res = run(
    `INSERT INTO commission_chairs (commission_id, member_id, start_date, end_date)
     VALUES (@commission_id, @member_id, @start_date, NULL)`,
    { commission_id, member_id, start_date }
  );
  const existing = get(
    `SELECT 1 FROM commission_members
     WHERE commission_id=@commission_id AND member_id=@member_id
       AND (left_at IS NULL OR left_at>=@start_date)
       AND joined_at<=@start_date`,
    { commission_id, member_id, start_date }
  );
  if (!existing) {
    addMemberToCommission({ commission_id, member_id, joined_at: start_date, left_at: null });
  }
  return res.lastInsertRowid;
}
export function getCurrentChair(commission_id) {
  return get(
    `
    SELECT m.id, m.full_name, cc.start_date
    FROM commission_chairs cc
    JOIN members m ON m.id = cc.member_id
    WHERE cc.commission_id=@commission_id AND cc.end_date IS NULL
    `,
    { commission_id }
  ) || null;
}
export function getChairsHistory(commission_id) {
  return all(
    `
    SELECT m.full_name, cc.start_date, cc.end_date
    FROM commission_chairs cc
    JOIN members m ON m.id = cc.member_id
    WHERE cc.commission_id=@commission_id
    ORDER BY cc.start_date
    `,
    { commission_id }
  );
}

// ---------- Meetings & Attendance ----------
export function createMeeting({ commission_id, held_at, place }) {
  const res = run(
    `INSERT INTO meetings (commission_id, held_at, place)
     VALUES (@commission_id, @held_at, @place)`,
    { commission_id, held_at, place }
  );
  return res.lastInsertRowid;
}
export function updateMeeting(id, fields = {}) {
  const allowed = ['held_at', 'place'];
  const set = allowed.filter(k => k in fields).map(k => `${k}=@${k}`);
  if (!set.length) return { changes: 0 };
  return run(`UPDATE meetings SET ${set.join(', ')} WHERE id=@id`, { id, ...fields });
}
export function deleteMeeting(id) {
  return run(`DELETE FROM meetings WHERE id=@id`, { id });
}

export function setAttendance(meeting_id, attendanceList) {
  const insert = db.prepare(
    `INSERT OR REPLACE INTO attendance (meeting_id, member_id, present)
     VALUES (?, ?, ?)`
  );
  const trx = db.transaction((items) => {
    for (const it of items) insert.run(meeting_id, it.member_id, it.present ? 1 : 0);
  });
  trx(attendanceList);
}
export function listMeetingsByCommission(commission_id, { from = null, to = null } = {}) {
  let sql = `SELECT * FROM meetings WHERE commission_id=@commission_id`;
  const params = { commission_id };
  if (from) { sql += ` AND date(held_at) >= date(@from)`; params.from = from; }
  if (to) { sql += ` AND date(held_at) <= date(@to)`; params.to = to; }
  sql += ` ORDER BY held_at DESC`;
  return all(sql, params);
}
export function getMeeting(meeting_id) {
  const meeting = get(`SELECT * FROM meetings WHERE id=@meeting_id`, { meeting_id });
  if (!meeting) return null;
  meeting.attendance = all(
    `
    SELECT a.member_id, m.full_name, a.present
    FROM attendance a
    JOIN members m ON m.id = a.member_id
    WHERE a.meeting_id=@meeting_id
    ORDER BY m.full_name
    `,
    { meeting_id }
  );
  return meeting;
}

// ---------- Stats / Reports ----------
export function getAbsencesByCommission(commission_id, from, to) {
  const meetings = all(
    `SELECT id FROM meetings
     WHERE commission_id=@commission_id
       AND date(held_at) >= date(@from)
       AND date(held_at) <= date(@to)
     ORDER BY held_at`,
    { commission_id, from, to }
  );
  const totalMeetings = meetings.length;
  const meetingIds = meetings.map((m) => m.id);

  const members = all(
    `
    SELECT DISTINCT m.id, m.full_name
    FROM commission_members cm
    JOIN members m ON m.id = cm.member_id
    WHERE cm.commission_id=@commission_id
      AND cm.joined_at <= date(@to)
      AND (cm.left_at IS NULL OR cm.left_at >= date(@from))
    ORDER BY m.full_name
    `,
    { commission_id, from, to }
  );

  if (totalMeetings === 0) {
    return members.map((x) => ({
      member_id: x.id,
      full_name: x.full_name,
      total_meetings: 0,
      attended: 0,
      missed: 0
    }));
  }

  const attendedMap = new Map();
  const q = db.prepare(
    `SELECT COUNT(*) AS cnt
     FROM attendance
     WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')})
       AND member_id = ? AND present = 1`
  );
  for (const mem of members) {
    const row = q.get(...meetingIds, mem.id);
    attendedMap.set(mem.id, row.cnt || 0);
  }
  return members.map((m) => {
    const attended = attendedMap.get(m.id) || 0;
    return {
      member_id: m.id,
      full_name: m.full_name,
      total_meetings: totalMeetings,
      attended,
      missed: Math.max(totalMeetings - attended, 0)
    };
  });
}

export function getMeetingsCountByCommission(from, to) {
  return all(
    `
    SELECT c.id, c.name, COUNT(m.id) AS meetings_count
    FROM commissions c
    LEFT JOIN meetings m
      ON m.commission_id = c.id
     AND date(m.held_at) >= date(@from)
     AND date(m.held_at) <= date(@to)
    GROUP BY c.id, c.name
    ORDER BY c.name
    `,
    { from, to }
  );
}

// ---------- Exists helpers ----------
export function existsMember(id) {
  return !!get(`SELECT 1 AS x FROM members WHERE id=@id`, { id });
}
export function existsCommission(id) {
  return !!get(`SELECT 1 AS x FROM commissions WHERE id=@id`, { id });
}

export default {
  init,
  // users
  getUserByUsername,
  createUser,
  // members
  createMember,
  listMembers,
  getMember,
  updateMember,
  deleteMember,
  getMemberCommissions,
  // commissions
  createCommission,
  listCommissions,
  getCommission,
  updateCommission,
  deleteCommission,
  addMemberToCommission,
  updateMemberLeaveDate,
  removeMemberFromCommission,
  getCommissionMembers,
  setCommissionChair,
  getCurrentChair,
  getChairsHistory,
  // meetings
  createMeeting,
  updateMeeting,
  deleteMeeting,
  setAttendance,
  listMeetingsByCommission,
  getMeeting,
  // stats
  getAbsencesByCommission,
  getMeetingsCountByCommission,
  // utils
  existsMember,
  existsCommission
};