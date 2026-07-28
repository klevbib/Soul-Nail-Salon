// Route for open slots: GET /api/availability?serviceId=&staffId=&date= returns
// the bookable start times for a day. Thin HTTP shell around the pure
// availability engine in services/availability.ts.
import { Router } from 'express';
import { z } from 'zod';
import { getAvailability, AvailabilityError } from '../services/availability';

export const availabilityRouter = Router();

const querySchema = z.object({
  serviceId: z.string().min(1),
  staffId: z.string().min(1).optional(),
  // Expect a calendar date, YYYY-MM-DD.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

// GET /api/availability?serviceId=&staffId=&date=YYYY-MM-DD
availabilityRouter.get('/', async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { serviceId, staffId, date } = parsed.data;

  // Parse YYYY-MM-DD as a local date (midnight local), not UTC.
  const [y, m, d] = date.split('-').map(Number);
  const localDate = new Date(y, m - 1, d);

  try {
    const result = await getAvailability({ serviceId, staffId, date: localDate });
    res.json({ date, ...result });
  } catch (err) {
    if (err instanceof AvailabilityError) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }
});
