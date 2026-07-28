import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatTime,
  confirmationEmail,
  confirmationSms,
  reminderEmail,
  reminderSms,
  type BookingNotice,
} from './notifications';

// 2026-08-03 13:30 UTC → 14:30 in Europe/London (BST, +1).
const START = new Date('2026-08-03T13:30:00Z');

const notice: BookingNotice = {
  salonName: 'Soul Nail Salon',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: '+447700900000',
  serviceName: 'Gel Manicure',
  staffName: 'Mai',
  startTime: START,
};

describe('date/time formatting (Europe/London)', () => {
  it('formats the date with weekday', () => {
    expect(formatDate(START)).toBe('Monday, 3 August 2026');
  });
  it('formats the time in the salon timezone (BST), lowercased', () => {
    expect(formatTime(START)).toBe('2:30 pm');
  });
});

describe('confirmation copy', () => {
  it('email includes service, staff, when, and greets by first name', () => {
    const { subject, text, html } = confirmationEmail(notice);
    expect(subject).toBe('Your Soul Nail Salon booking is confirmed');
    expect(text).toContain('Hi Jane,');
    expect(text).toContain('Gel Manicure');
    expect(text).toContain('Mai');
    expect(text).toContain('Monday, 3 August 2026 at 2:30 pm');
    expect(html).toContain('<strong>Service:</strong> Gel Manicure');
  });
  it('sms is a single line with the key facts', () => {
    const sms = confirmationSms(notice);
    expect(sms).toContain('confirmed');
    expect(sms).toContain('Gel Manicure');
    expect(sms).toContain('Mai');
    expect(sms).toContain('Monday, 3 August 2026 at 2:30 pm');
    expect(sms).not.toContain('\n');
  });
});

describe('reminder copy', () => {
  it('email is framed as a reminder', () => {
    const { subject, text } = reminderEmail(notice);
    expect(subject).toBe('Reminder: your Soul Nail Salon appointment');
    expect(text).toContain('reminder');
    expect(text).toContain('Monday, 3 August 2026 at 2:30 pm');
  });
  it('sms is framed as a reminder', () => {
    expect(reminderSms(notice)).toContain('reminder');
  });
});
