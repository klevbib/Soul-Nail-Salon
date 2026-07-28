import { Router } from 'express';
import { z } from 'zod';
import { createBooking, BookingError } from '../services/booking';

export const bookingsRouter = Router();

const bodySchema = z.object({
  serviceId: z.string().min(1),
  // Optional: request a specific technician. Omitted => any qualified one.
  staffId: z.string().min(1).optional(),
  // Full ISO datetime for the requested start, e.g. "2026-07-15T10:30:00.000Z".
  startTime: z.string().datetime({ offset: true }),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().trim().email().max(200),
  customerPhone: z.string().trim().min(5).max(40),
});

// POST /api/bookings — create a booking (with double-booking guard).
bookingsRouter.post('/', async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;

  try {
    const booking = await createBooking({
      serviceId: data.serviceId,
      staffId: data.staffId,
      startTime: new Date(data.startTime),
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
    });
    res.status(201).json({ booking });
  } catch (err) {
    if (err instanceof BookingError) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }
});
