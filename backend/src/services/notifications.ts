// Booking notifications (Phase 4).
//
// Two kinds of thing live here, split the same way as payments.ts:
//   * Pure formatters (`confirmationEmail`, `confirmationSms`, `reminderEmail`,
//     `reminderSms`) that turn a booking into message copy. No I/O, no clock —
//     deterministic and unit-tested.
//   * Side-effecting senders (`sendBookingConfirmation`, `sendBookingReminder`)
//     that load the booking and hand the copy to Resend/Twilio.
//
// Free-first + fire-and-forget: every send is best-effort. A disabled channel
// (no key) is a silent no-op, and a provider failure is logged but never thrown
// — a booking must succeed even if the confirmation email bounces. Callers await
// these only to log; they never gate the booking on the result.

import { prisma } from '../lib/prisma';
import { config } from '../lib/config';
import { getResend } from '../lib/resend';
import { getTwilio } from '../lib/twilio';

/** The booking facts every message needs. Built from a persisted booking. */
export interface BookingNotice {
  salonName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceName: string;
  staffName: string;
  startTime: Date;
}

// Appointments are reasoned about in the salon's timezone regardless of server
// locale (see availability.ts for the same Europe/London convention).
const TZ = 'Europe/London';

/** e.g. "Monday, 3 August 2026". */
export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  }).format(d);
}

/** e.g. "2:30 pm". */
export function formatTime(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TZ,
  })
    .format(d)
    .toLowerCase();
}

export interface EmailBody {
  subject: string;
  text: string;
  html: string;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

export function confirmationEmail(n: BookingNotice): EmailBody {
  const when = `${formatDate(n.startTime)} at ${formatTime(n.startTime)}`;
  const subject = `Your ${n.salonName} booking is confirmed`;
  const text = [
    `Hi ${firstName(n.customerName)},`,
    ``,
    `Your appointment is confirmed:`,
    ``,
    `  Service: ${n.serviceName}`,
    `  With: ${n.staffName}`,
    `  When: ${when}`,
    ``,
    `See you soon!`,
    n.salonName,
  ].join('\n');
  const html =
    `<p>Hi ${firstName(n.customerName)},</p>` +
    `<p>Your appointment is confirmed:</p>` +
    `<ul>` +
    `<li><strong>Service:</strong> ${n.serviceName}</li>` +
    `<li><strong>With:</strong> ${n.staffName}</li>` +
    `<li><strong>When:</strong> ${when}</li>` +
    `</ul>` +
    `<p>See you soon!<br>${n.salonName}</p>`;
  return { subject, text, html };
}

export function confirmationSms(n: BookingNotice): string {
  return (
    `${n.salonName}: your ${n.serviceName} with ${n.staffName} is confirmed for ` +
    `${formatDate(n.startTime)} at ${formatTime(n.startTime)}. See you soon!`
  );
}

export function reminderEmail(n: BookingNotice): EmailBody {
  const when = `${formatDate(n.startTime)} at ${formatTime(n.startTime)}`;
  const subject = `Reminder: your ${n.salonName} appointment`;
  const text = [
    `Hi ${firstName(n.customerName)},`,
    ``,
    `Just a reminder of your upcoming appointment:`,
    ``,
    `  Service: ${n.serviceName}`,
    `  With: ${n.staffName}`,
    `  When: ${when}`,
    ``,
    `See you soon!`,
    n.salonName,
  ].join('\n');
  const html =
    `<p>Hi ${firstName(n.customerName)},</p>` +
    `<p>Just a reminder of your upcoming appointment:</p>` +
    `<ul>` +
    `<li><strong>Service:</strong> ${n.serviceName}</li>` +
    `<li><strong>With:</strong> ${n.staffName}</li>` +
    `<li><strong>When:</strong> ${when}</li>` +
    `</ul>` +
    `<p>See you soon!<br>${n.salonName}</p>`;
  return { subject, text, html };
}

export function reminderSms(n: BookingNotice): string {
  return (
    `${n.salonName} reminder: ${n.serviceName} with ${n.staffName} on ` +
    `${formatDate(n.startTime)} at ${formatTime(n.startTime)}. See you soon!`
  );
}

/** Whether each channel actually accepted the message. */
export interface DeliveryResult {
  emailSent: boolean;
  smsSent: boolean;
}

// Send one message across both channels. Each channel is independent and
// best-effort: a disabled channel is skipped, a failing one is logged and
// leaves the other untouched. Never throws.
async function deliver(n: BookingNotice, email: EmailBody, sms: string): Promise<DeliveryResult> {
  const result: DeliveryResult = { emailSent: false, smsSent: false };

  const resend = getResend();
  if (resend) {
    try {
      // Resend reports API failures (bad key, unverified from-address, …) in the
      // returned `error` field rather than by throwing; only network faults
      // reject. Check both so a failed send is never counted as delivered.
      const { error } = await resend.emails.send({
        from: config.fromEmail,
        to: n.customerEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      if (error) {
        // eslint-disable-next-line no-console
        console.error(`Email to ${n.customerEmail} failed:`, error);
      } else {
        result.emailSent = true;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Email to ${n.customerEmail} errored:`, err);
    }
  }

  const sms_client = getTwilio();
  if (sms_client) {
    try {
      await sms_client.messages.create({
        from: config.twilioFromNumber,
        to: n.customerPhone,
        body: sms,
      });
      result.smsSent = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`SMS to ${n.customerPhone} failed:`, err);
    }
  }

  return result;
}

// Load a booking and shape it into the notice the formatters expect. Returns
// null if the booking has vanished (e.g. rolled back) — callers treat that as
// nothing to send.
async function noticeFor(bookingId: string): Promise<BookingNotice | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { service: { select: { name: true } }, staff: { select: { name: true } } },
  });
  if (!booking) return null;
  return {
    salonName: config.salonName,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    serviceName: booking.service.name,
    staffName: booking.staff.name,
    startTime: booking.startTime,
  };
}

/**
 * Send the "booking confirmed" message for a booking. Fire-and-forget: safe to
 * call without awaiting; any failure is logged, never thrown.
 */
export async function sendBookingConfirmation(bookingId: string): Promise<DeliveryResult> {
  const notice = await noticeFor(bookingId);
  if (!notice) return { emailSent: false, smsSent: false };
  return deliver(notice, confirmationEmail(notice), confirmationSms(notice));
}

/**
 * Send the "appointment reminder" message for a booking. Returns the per-channel
 * result so the reminder sweep can decide whether to mark the booking reminded.
 */
export async function sendBookingReminder(bookingId: string): Promise<DeliveryResult> {
  const notice = await noticeFor(bookingId);
  if (!notice) return { emailSent: false, smsSent: false };
  return deliver(notice, reminderEmail(notice), reminderSms(notice));
}
