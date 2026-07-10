/**
 * booking.js — Multi-step "Book an Appointment" widget
 *
 * Powers the booking flow inside #panel-book on index.html. Four steps:
 *   1. Service      — pick a service (name, price, duration)
 *   2. Technician   — "Any available" or a specific qualified technician
 *   3. Date & Time  — pick a day, then an available start time
 *   4. Your Details — name / email / phone, review, confirm
 * followed by a confirmation screen.
 *
 * It talks to the booking backend (see backend/) over fetch:
 *   GET  /api/services
 *   GET  /api/staff?serviceId=
 *   GET  /api/availability?serviceId=&staffId=&date=YYYY-MM-DD
 *   POST /api/bookings
 *
 * The widget is plain vanilla JS (no build step) to match the rest of the site.
 * If the API can't be reached it degrades gracefully to a "call us" message.
 */
(function () {
  'use strict';

  // In local dev the static site and API run on different ports; in production
  // the API is served under the same origin at /api.
  const isLocal =
    location.protocol === 'file:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1';
  const API_BASE = isLocal ? 'http://localhost:4000/api' : '/api';

  const SALON_PHONE = '07962930379';

  // In-progress selections for the current booking.
  const state = {
    step: 1,
    services: [],
    service: null,
    staff: [], // qualified technicians for the chosen service
    staffId: null, // null => any available
    staffName: 'Any available',
    date: '', // YYYY-MM-DD
    slots: [], // [{ label, iso }]
    slotIso: null,
    slotLabel: null,
  };

  let bodyEl;
  let stepsEl;

  document.addEventListener('DOMContentLoaded', () => {
    bodyEl = document.getElementById('booking-body');
    stepsEl = document.getElementById('booking-steps');
    if (!bodyEl) return; // widget not on this page
    loadServices();
  });

  // ---- Helpers -------------------------------------------------------------

  function money(pence) {
    return '£' + (pence / 100).toFixed(pence % 100 === 0 ? 0 : 2);
  }

  function priceLabel(svc) {
    return svc.priceMinPence === svc.priceMaxPence
      ? 'from ' + money(svc.priceMinPence)
      : money(svc.priceMinPence) + ' – ' + money(svc.priceMaxPence);
  }

  function durationLabel(mins) {
    if (mins < 60) return mins + ' min';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? h + 'h ' + m + 'm' : h + 'h';
  }

  // Format a "HH:MM" 24h time as e.g. "9:30am".
  function prettyTime(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const period = h < 12 ? 'am' : 'pm';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + String(m).padStart(2, '0') + period;
  }

  function prettyDate(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  function goTo(step) {
    state.step = step;
    render();
  }

  function setSteps() {
    if (!stepsEl) return;
    stepsEl.querySelectorAll('li').forEach((li) => {
      const s = Number(li.dataset.step);
      li.classList.toggle('active', s === state.step);
      li.classList.toggle('done', s < state.step);
    });
    stepsEl.style.display = state.step > 4 ? 'none' : '';
  }

  function messageHtml(icon, text) {
    return (
      '<div class="booking-message"><i class="bx ' +
      icon +
      '"></i><p>' +
      text +
      '</p></div>'
    );
  }

  function callFallback() {
    return (
      '<div class="booking-message"><i class="bx bx-phone-off"></i>' +
      '<p>Sorry — online booking is unavailable right now. Please call us on ' +
      '<a href="tel:' +
      SALON_PHONE +
      '">' +
      SALON_PHONE +
      '</a> to book.</p></div>'
    );
  }

  // ---- Data loading --------------------------------------------------------

  async function loadServices() {
    render(messageHtml('bx-loader-alt bx-spin', 'Loading services…'));
    try {
      const res = await fetch(API_BASE + '/services');
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      state.services = data.services || [];
      render();
    } catch (err) {
      bodyEl.innerHTML = callFallback();
    }
  }

  async function loadStaff() {
    render(messageHtml('bx-loader-alt bx-spin', 'Loading technicians…'));
    try {
      const res = await fetch(API_BASE + '/staff?serviceId=' + encodeURIComponent(state.service.id));
      const data = await res.json();
      state.staff = data.staff || [];
    } catch (err) {
      state.staff = [];
    }
    render();
  }

  async function loadSlots() {
    state.slots = [];
    state.slotIso = null;
    if (!state.date) {
      render();
      return;
    }
    render(); // re-render with the date chosen + a loading note in the slots area
    const slotsBox = document.getElementById('booking-slots');
    if (slotsBox) slotsBox.innerHTML = messageHtml('bx-loader-alt bx-spin', 'Checking availability…');
    try {
      const params = new URLSearchParams({ serviceId: state.service.id, date: state.date });
      if (state.staffId) params.set('staffId', state.staffId);
      const res = await fetch(API_BASE + '/availability?' + params.toString());
      const data = await res.json();
      state.slots = (data.slots || []).map((label, i) => ({
        label,
        iso: data.slotsIso[i],
      }));
    } catch (err) {
      state.slots = [];
    }
    renderSlots();
  }

  async function submitBooking(btn) {
    btn.disabled = true;
    btn.textContent = 'Booking…';
    const form = document.getElementById('booking-form');
    const payload = {
      serviceId: state.service.id,
      startTime: state.slotIso,
      customerName: form.name.value.trim(),
      customerEmail: form.email.value.trim(),
      customerPhone: form.phone.value.trim(),
    };
    if (state.staffId) payload.staffId = state.staffId;

    try {
      const res = await fetch(API_BASE + '/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : 'Please check your details and try again.';
        showFormError(msg);
        btn.disabled = false;
        btn.textContent = 'Confirm booking';
        // If the slot was taken, nudge the user back to pick another.
        if (res.status === 409) {
          const back = document.getElementById('booking-form-retime');
          if (back) back.style.display = '';
        }
        return;
      }
      state.confirmed = data.booking;
      goTo(5);
    } catch (err) {
      showFormError('Could not reach the booking service. Please try again or call us.');
      btn.disabled = false;
      btn.textContent = 'Confirm booking';
    }
  }

  function showFormError(msg) {
    const box = document.getElementById('booking-form-error');
    if (box) {
      box.textContent = msg;
      box.style.display = '';
    }
  }

  // ---- Rendering -----------------------------------------------------------

  // `override` lets async loaders drop a transient message into the body.
  function render(override) {
    setSteps();
    if (override) {
      bodyEl.innerHTML = override;
      return;
    }
    switch (state.step) {
      case 1:
        return renderServices();
      case 2:
        return renderStaff();
      case 3:
        return renderDateTime();
      case 4:
        return renderDetails();
      case 5:
        return renderConfirmation();
    }
  }

  function renderServices() {
    if (state.services.length === 0) {
      bodyEl.innerHTML = messageHtml('bx-info-circle', 'No services available right now.');
      return;
    }
    const cards = state.services
      .map(
        (svc) =>
          '<button type="button" class="booking-option" data-id="' +
          svc.id +
          '">' +
          '<span class="bo-name">' +
          svc.name +
          '</span>' +
          '<span class="bo-meta">' +
          priceLabel(svc) +
          ' · ' +
          durationLabel(svc.durationMinutes) +
          '</span>' +
          '</button>',
      )
      .join('');
    bodyEl.innerHTML =
      '<p class="booking-prompt">Which service would you like?</p>' +
      '<div class="booking-options">' + cards + '</div>';
    bodyEl.querySelectorAll('.booking-option').forEach((el) => {
      el.addEventListener('click', () => {
        state.service = state.services.find((s) => s.id === el.dataset.id);
        // Reset downstream choices.
        state.staffId = null;
        state.staffName = 'Any available';
        state.date = '';
        state.slotIso = null;
        goTo(2);
        loadStaff();
      });
    });
  }

  function renderStaff() {
    const options = [
      '<button type="button" class="booking-option" data-id="">' +
        '<span class="bo-name">Any available technician</span>' +
        '<span class="bo-meta">We\'ll match you with a free technician</span>' +
        '</button>',
    ].concat(
      state.staff.map(
        (s) =>
          '<button type="button" class="booking-option" data-id="' +
          s.id +
          '"><span class="bo-name">' +
          s.name +
          '</span></button>',
      ),
    );
    bodyEl.innerHTML =
      backButton(1) +
      '<p class="booking-prompt">Choose your technician for ' +
      state.service.name +
      '.</p>' +
      '<div class="booking-options">' + options.join('') + '</div>';
    wireBack();
    bodyEl.querySelectorAll('.booking-option').forEach((el) => {
      el.addEventListener('click', () => {
        state.staffId = el.dataset.id || null;
        state.staffName = state.staffId
          ? state.staff.find((s) => s.id === state.staffId).name
          : 'Any available';
        state.date = '';
        state.slotIso = null;
        goTo(3);
      });
    });
  }

  function renderDateTime() {
    const today = new Date();
    const min = today.toISOString().slice(0, 10);
    const max = new Date(today.getTime() + 60 * 864e5).toISOString().slice(0, 10); // ~2 months out
    bodyEl.innerHTML =
      backButton(2) +
      '<p class="booking-prompt">Pick a date for your ' +
      state.service.name +
      '.</p>' +
      '<input type="date" id="booking-date" class="booking-date" min="' +
      min +
      '" max="' +
      max +
      '" value="' +
      (state.date || '') +
      '">' +
      '<div id="booking-slots" class="booking-slots"></div>';
    wireBack();
    const dateInput = document.getElementById('booking-date');
    dateInput.addEventListener('change', () => {
      state.date = dateInput.value;
      loadSlots();
    });
    if (state.date) renderSlots();
    else
      document.getElementById('booking-slots').innerHTML =
        '<p class="booking-hint">Choose a date to see available times.</p>';
  }

  function renderSlots() {
    const box = document.getElementById('booking-slots');
    if (!box) return;
    if (state.slots.length === 0) {
      box.innerHTML = messageHtml(
        'bx-calendar-x',
        'No times available on ' +
          prettyDate(state.date) +
          '. Try another day — the salon is closed on Mondays.',
      );
      return;
    }
    box.innerHTML =
      '<p class="booking-hint">Available times on ' +
      prettyDate(state.date) +
      ':</p><div class="booking-times">' +
      state.slots
        .map(
          (s) =>
            '<button type="button" class="booking-time" data-iso="' +
            s.iso +
            '" data-label="' +
            s.label +
            '">' +
            prettyTime(s.label) +
            '</button>',
        )
        .join('') +
      '</div>';
    box.querySelectorAll('.booking-time').forEach((el) => {
      el.addEventListener('click', () => {
        state.slotIso = el.dataset.iso;
        state.slotLabel = el.dataset.label;
        goTo(4);
      });
    });
  }

  function renderDetails() {
    bodyEl.innerHTML =
      backButton(3) +
      '<p class="booking-prompt">Almost done — your details.</p>' +
      '<div class="booking-summary">' +
      summaryRow('Service', state.service.name) +
      summaryRow('Technician', state.staffName) +
      summaryRow('When', prettyDate(state.date) + ', ' + prettyTime(state.slotLabel)) +
      summaryRow('Duration', durationLabel(state.service.durationMinutes)) +
      summaryRow('Price', priceLabel(state.service)) +
      '</div>' +
      '<div id="booking-form-error" class="booking-error" style="display:none"></div>' +
      '<p id="booking-form-retime" class="booking-hint" style="display:none">' +
      '<a href="#" id="booking-retime-link">← Pick another time</a></p>' +
      '<form id="booking-form" class="booking-form" novalidate>' +
      field('name', 'Full name', 'text', 'Jane Smith') +
      field('email', 'Email', 'email', 'jane@example.com') +
      field('phone', 'Phone', 'tel', '07…') +
      '<button type="submit" class="booking-submit">Confirm booking</button>' +
      '</form>' +
      '<p class="booking-hint booking-fineprint">No payment is taken now — we\'ll confirm your appointment by email.</p>';
    wireBack();
    const retime = document.getElementById('booking-retime-link');
    if (retime)
      retime.addEventListener('click', (e) => {
        e.preventDefault();
        goTo(3);
      });
    const form = document.getElementById('booking-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = validateDetails(form);
      if (err) {
        showFormError(err);
        return;
      }
      submitBooking(form.querySelector('.booking-submit'));
    });
  }

  function validateDetails(form) {
    if (!form.name.value.trim()) return 'Please enter your name.';
    const email = form.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
    if (form.phone.value.trim().length < 5) return 'Please enter a contact phone number.';
    return null;
  }

  function renderConfirmation() {
    const b = state.confirmed || {};
    bodyEl.innerHTML =
      '<div class="booking-message booking-success">' +
      '<i class="bx bx-check-circle"></i>' +
      '<h4>You\'re booked in!</h4>' +
      '<div class="booking-summary">' +
      summaryRow('Service', b.serviceName || state.service.name) +
      summaryRow('Technician', b.staffName || state.staffName) +
      summaryRow('When', prettyDate(state.date) + ', ' + prettyTime(state.slotLabel)) +
      summaryRow('Reference', (b.id || '').slice(-8).toUpperCase()) +
      '</div>' +
      '<p>We look forward to seeing you at 1 Peter St, Altrincham. ' +
      'Need to change something? Call us on <a href="tel:' +
      SALON_PHONE +
      '">' +
      SALON_PHONE +
      '</a>.</p>' +
      '<button type="button" class="booking-submit" id="booking-again">Book another appointment</button>' +
      '</div>';
    document.getElementById('booking-again').addEventListener('click', () => {
      state.service = null;
      state.staffId = null;
      state.date = '';
      state.slotIso = null;
      state.confirmed = null;
      goTo(1);
    });
  }

  // ---- Small markup helpers ------------------------------------------------

  function backButton(toStep) {
    return (
      '<button type="button" class="booking-back" data-to="' +
      toStep +
      '"><i class="bx bx-chevron-left"></i> Back</button>'
    );
  }

  function wireBack() {
    const b = bodyEl.querySelector('.booking-back');
    if (b) b.addEventListener('click', () => goTo(Number(b.dataset.to)));
  }

  function summaryRow(label, value) {
    return (
      '<div class="booking-summary-row"><span>' +
      label +
      '</span><strong>' +
      value +
      '</strong></div>'
    );
  }

  function field(name, label, type, placeholder) {
    return (
      '<label class="booking-field"><span>' +
      label +
      '</span><input name="' +
      name +
      '" type="' +
      type +
      '" placeholder="' +
      placeholder +
      '" autocomplete="' +
      (name === 'name' ? 'name' : name === 'email' ? 'email' : 'tel') +
      '" required></label>'
    );
  }
})();
