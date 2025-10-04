// public/app.js

// --- БАЗА ДЛЯ API ---
const API_BASE = (location.origin.includes(':3000')) ? '' : 'http://localhost:3000';

// ================== СЕССИЯ ==================
const store = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null')
};
function saveSession({ token, user }) {
  store.token = token;
  store.user = user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  applyAuthUI();
}
function clearSession() {
  store.token = null;
  store.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  applyAuthUI();
}

// ================== УТИЛИТЫ ==================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function toast(msg, ms = 2800) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), ms);
}

async function api(path, { method = 'GET', body = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (store.token) headers['Authorization'] = `Bearer ${store.token}`;
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  if (!res.ok) {
    let errText = 'HTTP ' + res.status;
    try {
      const data = await res.json();
      if (data?.error) errText = data.error;
    } catch {}
    throw new Error(errText);
  }
  return res.json();
}

function fmtDate(dt) {
  if (!dt) return '';
  if (dt.length === 10) return dt;
  return dt.replace('T', ' ');
}
const roleIsAdmin = () => store.user?.role === 'admin';
function setAdminVisibility() {
  $$('.admin-only').forEach(b => roleIsAdmin() ? b.classList.remove('hidden') : b.classList.add('hidden'));
}

// ================== АВТОРИЗАЦИЯ ==================
function applyAuthUI() {
  const loginForm = $('#loginForm');
  const userPanel = $('#userPanel');
  const tabs = $('#tabs');

  if (store.token && store.user) {
    loginForm.classList.add('hidden');
    userPanel.classList.remove('hidden');
    tabs.classList.remove('hidden');
    $('#whoami').textContent = `${store.user.username} (${store.user.role})`;
    setAdminVisibility();
  } else {
    loginForm.classList.remove('hidden');
    userPanel.classList.add('hidden');
    tabs.classList.add('hidden');
    $$('.tabpane').forEach(p => p.classList.add('hidden'));
  }
}

async function login(username, password) {
  const data = await api('/api/auth/login', { method: 'POST', body: { username, password } });
  saveSession(data);
  toast('Вход выполнен');
  await loadCommissions();
  showTab('commissions');
}
function logout() { clearSession(); toast('Вы вышли из системы'); }

// ================== ТАБЫ ==================
function showTab(name) {
  $$('.tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === name));
  $$('.tabpane').forEach(pane => pane.classList.toggle('hidden', pane.id !== `tab-${name}`));
  if (name === 'commissions') loadCommissions();
  if (name === 'members') loadMembers();
}

// ================== ТАБ «КОМИССИИ» ==================
async function loadCommissions() {
  try {
    const items = await api('/api/commissions');
    const wrap = $('#commissionsList');
    wrap.innerHTML = '';
    items.forEach(c => {
      const div = document.createElement('div');
      const chair = c.currentChair ? `${c.currentChair.full_name} (с ${c.currentChair.start_date})` : '—';
      div.className = 'item card';
      div.innerHTML = `
        <div>
          <div><strong>${c.name}</strong></div>
          <div class="muted">${c.profile || ''}</div>
          <div class="muted">Председатель: ${chair}</div>
        </div>
        <div><button data-open="${c.id}">Открыть</button></div>`;
      div.querySelector('button').addEventListener('click', () => openCommission(c.id));
      wrap.appendChild(div);
    });
  } catch (e) { toast(`Ошибка: ${e.message}`); }
}

async function openCommission(id) {
  try {
    const [commission, members, chairs] = await Promise.all([
      api(`/api/commissions/${id}`),
      api(`/api/commissions/${id}/members`),
      api(`/api/commissions/${id}/chairs`)
    ]);

    const dlg = $('#commissionDialog');
    $('#commissionTitle').textContent = commission.name;
    $('#commissionMeta').textContent = commission.profile || '';

    // Состав (с кнопками удаления для админа)
    const cont = $('#commissionMembers');
    if (members.length) {
      const rows = members.map(m => [
        m.id,
        m.full_name,
        m.joined_at || '',
        m.left_at || '',
        roleIsAdmin() ? `<button class="secondary" data-rem="${m.id}">Удалить из комиссии</button>` : ''
      ]);
      cont.innerHTML = renderTable(['ID','ФИО','Вступил','Вышел', roleIsAdmin() ? 'Действия' : ''], rows);
      if (roleIsAdmin()) {
        $$('#commissionMembers [data-rem]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const member_id = Number(btn.getAttribute('data-rem'));
            if (!confirm('Удалить участника из комиссии?')) return;
            try {
              await api(`/api/commissions/${id}/members/${member_id}`, { method: 'DELETE' });
              toast('Участник удалён из комиссии');
              openCommission(id);
            } catch (err) { toast(`Ошибка: ${err.message}`); }
          });
        });
      }
    } else {
      cont.innerHTML = '<div class="muted">Нет участников</div>';
    }

    // Председатель
    const chairBox = $('#commissionChair');
    chairBox.innerHTML = commission.currentChair
      ? `<div><strong>${commission.currentChair.full_name}</strong> (с ${commission.currentChair.start_date})</div>`
      : '<div class="muted">Не назначен</div>';

    // История председателей
    const hist = $('#chairsHistory');
    hist.innerHTML = chairs.length
      ? renderTable(['ФИО','Начало','Окончание'], chairs.map(x => [x.full_name, x.start_date, x.end_date || '']))
      : '<div class="muted">Нет данных</div>';

    // Редактирование/удаление комиссии
    if (roleIsAdmin()) {
      let panel = document.getElementById('commissionEditPanel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'commissionEditPanel';
        panel.className = 'card mt';
        $('#commissionDialog .modal-body').appendChild(panel);
      }
      panel.innerHTML = `
        <h4>Редактировать комиссию</h4>
        <form id="editCommissionForm" class="grid two">
          <input type="hidden" name="id" value="${commission.id}">
          <label>Название
            <input name="name" type="text" value="${commission.name}">
          </label>
          <label>Профиль
            <input name="profile" type="text" value="${commission.profile || ''}">
          </label>
          <label class="full">Описание
            <textarea name="description" rows="2">${commission.description || ''}</textarea>
          </label>
          <div class="full right">
            <button type="submit">Сохранить</button>
            <button type="button" class="danger" id="deleteCommissionBtn">Удалить комиссию</button>
          </div>
        </form>
      `;

      $('#editCommissionForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const cid = Number(form.querySelector('input[name="id"]')?.value);
        if (!cid || Number.isNaN(cid)) return toast('Некорректный ID комиссии');
        const fd = new FormData(form);
        const body = Object.fromEntries(fd.entries()); delete body.id;
        try {
          await api(`/api/commissions/${cid}`, { method: 'PATCH', body });
          toast('Комиссия обновлена');
          openCommission(cid);
          loadCommissions();
        } catch (err) { toast(`Ошибка: ${err.message}`); }
      });

      $('#deleteCommissionBtn').addEventListener('click', async () => {
        if (!confirm('Удалить комиссию со всеми данными?')) return;
        try {
          await api(`/api/commissions/${commission.id}`, { method: 'DELETE' });
          toast('Комиссия удалена');
          dlg.close();
          loadCommissions();
        } catch (err) { toast(`Ошибка: ${err.message}`); }
      });
    } else {
      // если не админ — подчистим случайно оставшуюся панель из прошлой сессии
      const p = document.getElementById('commissionEditPanel');
      if (p) p.remove();
    }

    setAdminVisibility();
    $('#addMemberToCommissionForm [name="commission_id"]').value = String(id);
    $('#setChairForm [name="commission_id"]').value = String(id);
    openModal(dlg);
  } catch (e) { toast(`Ошибка: ${e.message}`); }
}

// Создание комиссии
$('#createCommissionForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const fd = new FormData(form);
  const body = Object.fromEntries(fd.entries());
  ['chair_id','profile','description','chair_start_date'].forEach(k => { if (!body[k]) delete body[k]; });
  if (body.chair_id) body.chair_id = Number(body.chair_id);
  try {
    await api('/api/commissions', { method: 'POST', body });
    toast('Комиссия создана');
    form.reset();
    loadCommissions();
  } catch (err) { toast(`Ошибка: ${err.message}`); }
});

// Добавить члена в комиссию
$('#addMemberToCommissionForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const fd = new FormData(form);
  const commission_id = Number(fd.get('commission_id'));
  const body = { member_id: Number(fd.get('member_id')), joined_at: fd.get('joined_at'), left_at: fd.get('left_at') || undefined };
  try {
    await api(`/api/commissions/${commission_id}/members`, { method: 'POST', body });
    toast('Член добавлен в комиссию');
    openCommission(commission_id);
    form.reset();
  } catch (err) { toast(`Ошибка: ${err.message}`); }
});

// Назначить председателя
$('#setChairForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const fd = new FormData(form);
  const commission_id = Number(fd.get('commission_id'));
  const body = { member_id: Number(fd.get('member_id')), start_date: fd.get('start_date') };
  try {
    await api(`/api/commissions/${commission_id}/chair`, { method: 'POST', body });
    toast('Председатель назначен');
    openCommission(commission_id);
    form.reset();
  } catch (err) { toast(`Ошибка: ${err.message}`); }
});

// ================== ТАБ «ЧЛЕНЫ» ==================
async function loadMembers() {
  try {
    const rows = await api('/api/members');
    const wrap = $('#membersList');
    wrap.innerHTML = '';
    rows.forEach(m => {
      const div = document.createElement('div');
      div.className = 'item card';
      div.innerHTML = `
        <div>
          <div><strong>${m.full_name}</strong></div>
          <div class="muted">ID: ${m.id}</div>
        </div>
        <div><button data-open="${m.id}">Открыть</button></div>`;
      div.querySelector('button').addEventListener('click', () => openMember(m.id));
      wrap.appendChild(div);
    });
  } catch (e) { toast(`Ошибка: ${e.message}`); }
}

async function openMember(id) {
  try {
    const data = await api(`/api/members/${id}`);
    const dlg = $('#memberDialog');
    $('#memberTitle').textContent = data.full_name;
    $('#memberContacts').textContent = [
      data.address && `Адрес: ${data.address}`,
      data.home_phone && `Дом.: ${data.home_phone}`,
      data.work_phone && `Раб.: ${data.work_phone}`
    ].filter(Boolean).join(' • ') || '—';

    $('#memberCommissions').innerHTML = data.commissions?.length
      ? renderTable(['Комиссия','Профиль','Вступил','Вышел'], data.commissions.map(x => [x.name, x.profile || '', x.joined_at || '', x.left_at || '']))
      : '<div class="muted">Нет данных</div>';

    $('#memberChairs').innerHTML = data.chairs?.length
      ? renderTable(['Комиссия','Начало','Окончание'], data.chairs.map(x => [x.name, x.start_date, x.end_date || '']))
      : '<div class="muted">Нет данных</div>';

    if (roleIsAdmin()) {
      let panel = document.getElementById('memberEditPanel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'memberEditPanel';
        panel.className = 'card mt';
        $('#memberDialog .modal-body').appendChild(panel);
      }
      panel.innerHTML = `
        <h4>Редактировать члена</h4>
        <form id="editMemberForm" class="grid two">
          <input type="hidden" name="id" value="${data.id}">
          <label>ФИО
            <input name="full_name" type="text" value="${data.full_name}">
          </label>
          <label>Адрес
            <input name="address" type="text" value="${data.address || ''}">
          </label>
          <label>Дом. телефон
            <input name="home_phone" type="text" value="${data.home_phone || ''}">
          </label>
          <label>Раб. телефон
            <input name="work_phone" type="text" value="${data.work_phone || ''}">
          </label>
          <div class="full right">
            <button type="submit">Сохранить</button>
            <button type="button" class="danger" id="deleteMemberBtn">Удалить</button>
          </div>
        </form>
      `;
      $('#editMemberForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const mid = Number(form.querySelector('input[name="id"]')?.value);
        if (!mid || Number.isNaN(mid)) return toast('Некорректный ID члена');
        const fd = new FormData(form);
        const body = Object.fromEntries(fd.entries()); delete body.id;
        try {
          await api(`/api/members/${mid}`, { method: 'PATCH', body });
          toast('Изменения сохранены');
          openMember(mid);
          loadMembers();
        } catch (err) { toast(`Ошибка: ${err.message}`); }
      });
      $('#deleteMemberBtn').addEventListener('click', async () => {
        if (!confirm('Удалить члена и все связанные записи?')) return;
        try {
          await api(`/api/members/${data.id}`, { method: 'DELETE' });
          toast('Член удалён');
          dlg.close();
          loadMembers();
        } catch (err) { toast(`Ошибка: ${err.message}`); }
      });
    } else {
      const p = document.getElementById('memberEditPanel');
      if (p) p.remove();
    }

    openModal(dlg);
  } catch (e) { toast(`Ошибка: ${e.message}`); }
}

// Создать нового члена
$('#createMemberForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const fd = new FormData(form);
  const body = Object.fromEntries(fd.entries());
  try {
    await api('/api/members', { method: 'POST', body });
    toast('Член добавлен');
    form.reset();
    loadMembers();
  } catch (err) { toast(`Ошибка: ${err.message}`); }
});

// ================== ТАБ «ЗАСЕДАНИЯ» ==================
$('#filterMeetingsForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const fd = new FormData(form);
  const commission_id = Number(fd.get('commission_id'));
  const from = fd.get('from'); const to = fd.get('to');
  try {
    const qs = new URLSearchParams(); if (from) qs.set('from', from); if (to) qs.set('to', to);
    const rows = await api(`/api/meetings/commission/${commission_id}?${qs.toString()}`);
    const wrap = $('#meetingsList');
    wrap.innerHTML = rows.length ? rows.map(m => `
      <div class="item card">
        <div><div><strong>${fmtDate(m.held_at)}</strong></div>
        <div class="muted">ID заседания: ${m.id} • Место: ${m.place}</div></div>
        <div><button data-open="${m.id}">Открыть</button></div>
      </div>`).join('') : '<div class="muted">Заседаний не найдено</div>';
    $$('#meetingsList [data-open]').forEach(btn => btn.addEventListener('click', () => openMeeting(Number(btn.dataset.open))));
  } catch (e2) { toast(`Ошибка: ${e2.message}`); }
});

$('#createMeetingForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const fd = new FormData(form);
  const body = { commission_id: Number(fd.get('commission_id')), held_at: fd.get('held_at'), place: fd.get('place') };
  try {
    const mtg = await api('/api/meetings', { method: 'POST', body });
    toast('Заседание создано');
    form.reset();
    const filterId = Number($('#filterMeetingsForm [name="commission_id"]').value || '0');
    if (filterId === mtg.commission_id) $('#filterMeetingsForm').requestSubmit();
  } catch (err) { toast(`Ошибка: ${err.message}`); }
});

async function openMeeting(id) {
  try {
    const mtg = await api(`/api/meetings/${id}`);
    const dlg = $('#meetingDialog');
    $('#meetingTitle').textContent = `Заседание #${mtg.id}`;
    $('#meetingMeta').textContent = `Комиссия ID ${mtg.commission_id} • ${fmtDate(mtg.held_at)} • ${mtg.place}`;

    $('#attendanceList').innerHTML = mtg.attendance?.length
      ? renderTable(['ФИО','Статус'], mtg.attendance.map(a => [a.full_name, a.present ? 'присутствовал' : 'отсутствовал']))
      : '<div class="muted">Посещаемость не отмечена</div>';

    const form = $('#attendanceForm');
    const adminBlock = $('#adminAttendanceBlock');

    if (roleIsAdmin()) {
      adminBlock.classList.remove('hidden');

      let peopleForForm = [];
      if (Array.isArray(mtg.attendance) && mtg.attendance.length > 0) {
        peopleForForm = mtg.attendance.map(a => ({ member_id: a.member_id, full_name: a.full_name, present: !!a.present }));
      } else {
        const members = await api(`/api/commissions/${mtg.commission_id}/members`);
        peopleForForm = members.map(m => ({ member_id: m.id, full_name: m.full_name, present: false }));
      }

      form.innerHTML = peopleForForm.map(p => `
        <label>
          <input type="checkbox" name="member_${p.member_id}" ${p.present ? 'checked' : ''}>
          ${p.full_name}
        </label>
      `).join('') + `<div class="right mt"><button type="submit">Сохранить посещаемость</button></div>`;

      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const attendance = peopleForForm.map(p => ({ member_id: p.member_id, present: form[`member_${p.member_id}`].checked }));
        try {
          const updated = await api(`/api/meetings/${mtg.id}/attendance`, { method: 'PUT', body: { attendance } });
          toast('Посещаемость сохранена');
          openMeeting(updated.id);
        } catch (err) { toast(`Ошибка: ${err.message}`); }
      };

      // панель редактирования/удаления заседания
      let panel = document.getElementById('meetingEditPanel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'meetingEditPanel';
        panel.className = 'card mt';
        $('#meetingDialog .modal-body').appendChild(panel);
      }
      panel.innerHTML = `
        <h4>Редактировать заседание</h4>
        <form id="editMeetingForm" class="grid two">
          <input type="hidden" name="id" value="${mtg.id}">
          <label>Дата и время
            <input name="held_at" type="datetime-local" value="${mtg.held_at}">
          </label>
          <label>Место
            <input name="place" type="text" value="${mtg.place}">
          </label>
          <div class="full right">
            <button type="submit">Сохранить</button>
            <button type="button" class="danger" id="deleteMeetingBtn">Удалить заседание</button>
          </div>
        </form>
      `;
      $('#editMeetingForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const mid = Number(f.querySelector('input[name="id"]')?.value);
        if (!mid || Number.isNaN(mid)) return toast('Некорректный ID заседания');
        const fd = new FormData(f);
        const body = Object.fromEntries(fd.entries()); delete body.id;
        try {
          await api(`/api/meetings/${mid}`, { method: 'PATCH', body });
          toast('Заседание обновлено');
          openMeeting(mid);
          const filterId = Number($('#filterMeetingsForm [name="commission_id"]').value || '0');
          if (filterId === mtg.commission_id) $('#filterMeetingsForm').requestSubmit();
        } catch (err) { toast(`Ошибка: ${err.message}`); }
      });
      $('#deleteMeetingBtn').addEventListener('click', async () => {
        if (!confirm('Удалить заседание?')) return;
        try {
          await api(`/api/meetings/${mtg.id}`, { method: 'DELETE' });
          toast('Заседание удалено');
          dlg.close();
          const filterId = Number($('#filterMeetingsForm [name="commission_id"]').value || '0');
          if (filterId === mtg.commission_id) $('#filterMeetingsForm').requestSubmit();
        } catch (err) { toast(`Ошибка: ${err.message}`); }
      });
    } else {
      adminBlock.classList.add('hidden');
      const p = document.getElementById('meetingEditPanel');
      if (p) p.remove();
    }

    openModal(dlg);
  } catch (e) { toast(`Ошибка: ${e.message}`); }
}

// ================== ОТЧЁТЫ ==================
$('#absencesForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const fd = new FormData(form);
  const commission_id = Number(fd.get('commission_id'));
  const from = fd.get('from'); const to = fd.get('to');
  try {
    const data = await api(`/api/stats/commission/${commission_id}/absences?from=${from}&to=${to}`);
    const rows = data.results || [];
    $('#absencesResult').innerHTML = rows.length
      ? renderTable(['ФИО','Всего засед.','Посещено','Пропущено'], rows.map(r => [r.full_name, r.total_meetings, r.attended, r.missed]))
      : '<div class="muted">Нет заседаний в указанном диапазоне</div>';
  } catch (e2) { toast(`Ошибка: ${e2.message}`); }
});

$('#meetingsCountForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const fd = new FormData(form);
  const from = fd.get('from'); const to = fd.get('to');
  try {
    const data = await api(`/api/stats/meetings-count?from=${from}&to=${to}`);
    const rows = data.commissions || [];
    $('#meetingsCountResult').innerHTML = rows.length
      ? renderTable(['Комиссия','Кол-во заседаний'], rows.map(r => [r.name, r.meetings_count]))
      : '<div class="muted">Нет данных</div>';
  } catch (e2) { toast(`Ошибка: ${e2.message}`); }
});

// ================== РЕНДЕР ТАБЛИЦ ==================
function renderTable(headers, rows) {
  const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<div class="table-wrap"><table>${thead}${tbody}</table></div>`;
}

// ================== МОДАЛКИ ==================
function openModal(dlg) { dlg.showModal(); }
$$('[data-close]')?.forEach(btn => btn.addEventListener('click', e => e.target.closest('dialog')?.close()));

// ================== ЛОГИН/ЛОГАУТ ==================
$('#loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('#loginUsername').value.trim();
  const password = $('#loginPassword').value;
  try { await login(username, password); } catch (err) { toast(`Ошибка входа: ${err.message}`); }
});
$('#logoutBtn')?.addEventListener('click', () => logout());

// ================== ТАБЫ ==================
$('#tabs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab'); if (!btn) return; showTab(btn.dataset.tab);
});

// ================== INIT ==================
(function init(){
  applyAuthUI();
  if (store.token) { showTab('commissions'); }
})();
