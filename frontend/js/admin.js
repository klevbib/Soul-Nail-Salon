/**
 * admin.js — staff dashboard for Soul Nail Salon (Phase 5).
 *
 * Talks to the admin API (see backend/src/routes/admin.ts) using a cookie
 * session, so every request sends `credentials: 'include'`. The cookie itself
 * is HttpOnly — this script can't read it; it only knows "logged in" by whether
 * GET /api/admin/me succeeds.
 *
 *   POST   /api/admin/login   { password }
 *   POST   /api/admin/logout
 *   GET    /api/admin/me
 *   GET    /api/admin/bookings ?status=&from=&to=
 *   PATCH  /api/admin/bookings/:id { action }
 *   GET    /api/admin/timeoff  /  POST  /api/admin/timeoff  /  DELETE /api/admin/timeoff/:id
 *   GET    /api/staff          (reused to populate the technician dropdown)
 *
 * Plain vanilla JS, no build step, matching the rest of the site.
 */
(function () {
  'use strict';

  const isLocal =
    location.protocol === 'file:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1';
  const API_BASE = isLocal ? 'http://localhost:4000/api' : '/api';

  // Every call carries the session cookie.
  function api(path, options) {
    return fetch(API_BASE + path, Object.assign({ credentials: 'include' }, options));
  }

  const $ = (id) => document.getElementById(id);

  const loginView = $('login');
  const dashboardView = $('dashboard');

  function showMsg(el, text, kind) {
    el.textContent = text;
    el.className = 'msg ' + (kind || 'err');
  }
  function clearMsg(el) {
    el.textContent = '';
    el.className = 'msg';
  }

  // ---- Auth ----

  async function checkSession() {
    try {
      const res = await api('/me');
      if (res.ok) {
        enterDashboard();
      } else {
        showLogin();
      }
    } catch (_e) {
      showLogin();
    }
  }

  function showLogin() {
    loginView.classList.remove('hidden');
    dashboardView.classList.add('hidden');
  }

  function enterDashboard() {
    loginView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    loadStaff();
    loadBookings();
    loadTimeOff();
  }

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsg($('login-msg'));
    const password = $('password').value;
    try {
      const res = await api('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        $('password').value = '';
        enterDashboard();
      } else if (res.status === 429) {
        showMsg($('login-msg'), 'Too many attempts. Please wait a few minutes.');
      } else if (res.status === 503) {
        showMsg($('login-msg'), 'Admin dashboard is not configured on the server.');
      } else {
        showMsg($('login-msg'), 'Incorrect password.');
      }
    } catch (_e) {
      showMsg($('login-msg'), 'Could not reach the server.');
    }
  });

  $('logout').addEventListener('click', async () => {
    try {
      await api('/admin/logout', { method: 'POST' });
    } catch (_e) {
      /* ignore */
    }
    showLogin();
  });

  // If a request comes back 401 mid-session (expired cookie), bounce to login.
  function guard401(res) {
    if (res.status === 401) {
      showLogin();
      return true;
    }
    return false;
  }

  // ---- Bookings ----

  const statusFilter = $('filter-status');
  const fromFilter = $('filter-from');
  const toFilter = $('filter-to');

  $('apply-filters').addEventListener('click', loadBookings);
  $('clear-filters').addEventListener('click', () => {
    statusFilter.value = '';
    fromFilter.value = '';
    toFilter.value = '';
    loadBookings();
  });

  function fmtDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  }

  // A yyyy-mm-dd date input -> ISO at start/end of that day, so the server's
  // datetime filter matches what the user expects.
  function dayStartIso(v) { return v ? new Date(v + 'T00:00:00').toISOString() : null; }
  function dayEndIso(v) { return v ? new Date(v + 'T23:59:59').toISOString() : null; }

  async function loadBookings() {
    clearMsg($('bookings-msg'));
    const params = new URLSearchParams();
    if (statusFilter.value) params.set('status', statusFilter.value);
    const from = dayStartIso(fromFilter.value);
    const to = dayEndIso(toFilter.value);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    try {
      const res = await api('/admin/bookings?' + params.toString());
      if (guard401(res)) return;
      if (!res.ok) throw new Error('load failed');
      const { bookings } = await res.json();
      renderBookings(bookings);
    } catch (_e) {
      showMsg($('bookings-msg'), 'Could not load bookings.');
    }
  }

  function renderBookings(bookings) {
    const body = $('bookings-body');
    body.innerHTML = '';
    $('bookings-empty').classList.toggle('hidden', bookings.length > 0);

    for (const b of bookings) {
      const tr = document.createElement('tr');

      const when = document.createElement('td');
      when.textContent = fmtDateTime(b.startTime);
      tr.appendChild(when);

      const service = document.createElement('td');
      service.textContent = b.serviceName;
      tr.appendChild(service);

      const tech = document.createElement('td');
      tech.textContent = b.staffName;
      tr.appendChild(tech);

      const cust = document.createElement('td');
      cust.innerHTML =
        escapeHtml(b.customerName) +
        '<div class="muted">' + escapeHtml(b.customerPhone) + '</div>';
      tr.appendChild(cust);

      const status = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'pill ' + b.status;
      pill.textContent = b.status;
      status.appendChild(pill);
      tr.appendChild(status);

      const actions = document.createElement('td');
      // Cancel: allowed while pending or confirmed. Complete: only confirmed.
      if (b.status === 'confirmed') {
        actions.appendChild(actionButton('Complete', 'small', () => patchBooking(b.id, 'complete')));
      }
      if (b.status === 'pending' || b.status === 'confirmed') {
        actions.appendChild(actionButton('Cancel', 'ghost small', () => patchBooking(b.id, 'cancel')));
      }
      tr.appendChild(actions);

      body.appendChild(tr);
    }
  }

  function actionButton(label, cls, onClick) {
    const btn = document.createElement('button');
    btn.className = cls;
    btn.textContent = label;
    btn.style.marginRight = '6px';
    btn.addEventListener('click', onClick);
    return btn;
  }

  async function patchBooking(id, action) {
    if (action === 'cancel' && !confirm('Cancel this booking?')) return;
    try {
      const res = await api('/admin/bookings/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (guard401(res)) return;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showMsg($('bookings-msg'), data.error || 'Could not update booking.');
        return;
      }
      loadBookings();
    } catch (_e) {
      showMsg($('bookings-msg'), 'Could not update booking.');
    }
  }

  // ---- Time off ----

  async function loadStaff() {
    try {
      const res = await api('/staff');
      if (!res.ok) return;
      const { staff } = await res.json();
      const sel = $('to-staff');
      sel.innerHTML = '';
      for (const s of staff) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        sel.appendChild(opt);
      }
    } catch (_e) {
      /* ignore — the form just won't have options */
    }
  }

  // datetime-local gives "YYYY-MM-DDTHH:mm" in local time; toISOString for the API.
  function localToIso(v) { return v ? new Date(v).toISOString() : null; }

  $('timeoff-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsg($('timeoff-msg'));
    const staffId = $('to-staff').value;
    const start = localToIso($('to-start').value);
    const end = localToIso($('to-end').value);
    const reason = $('to-reason').value.trim();

    if (!staffId || !start || !end) {
      showMsg($('timeoff-msg'), 'Technician, start and end are required.');
      return;
    }
    if (new Date(end) <= new Date(start)) {
      showMsg($('timeoff-msg'), 'End must be after start.');
      return;
    }

    try {
      const res = await api('/admin/timeoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, startTime: start, endTime: end, reason: reason || undefined }),
      });
      if (guard401(res)) return;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showMsg($('timeoff-msg'), typeof data.error === 'string' ? data.error : 'Could not add time off.');
        return;
      }
      showMsg($('timeoff-msg'), 'Time off added.', 'ok');
      $('to-start').value = '';
      $('to-end').value = '';
      $('to-reason').value = '';
      loadTimeOff();
    } catch (_e) {
      showMsg($('timeoff-msg'), 'Could not add time off.');
    }
  });

  async function loadTimeOff() {
    try {
      const res = await api('/admin/timeoff');
      if (guard401(res)) return;
      if (!res.ok) return;
      const { timeOff } = await res.json();
      renderTimeOff(timeOff);
    } catch (_e) {
      /* ignore */
    }
  }

  function renderTimeOff(blocks) {
    const body = $('timeoff-body');
    body.innerHTML = '';
    $('timeoff-empty').classList.toggle('hidden', blocks.length > 0);

    for (const t of blocks) {
      const tr = document.createElement('tr');
      tr.appendChild(cell(t.staffName));
      tr.appendChild(cell(fmtDateTime(t.startTime)));
      tr.appendChild(cell(fmtDateTime(t.endTime)));
      tr.appendChild(cell(t.reason || '—'));

      const actions = document.createElement('td');
      actions.appendChild(actionButton('Remove', 'ghost small', () => deleteTimeOff(t.id)));
      tr.appendChild(actions);
      body.appendChild(tr);
    }
  }

  function cell(text) {
    const td = document.createElement('td');
    td.textContent = text;
    return td;
  }

  async function deleteTimeOff(id) {
    if (!confirm('Remove this time-off block?')) return;
    try {
      const res = await api('/admin/timeoff/' + encodeURIComponent(id), { method: 'DELETE' });
      if (guard401(res)) return;
      loadTimeOff();
    } catch (_e) {
      /* ignore */
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  // Kick off: is there already a valid session?
  checkSession();
})();
