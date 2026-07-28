// Routes for the service catalogue: GET /api/services lists the bookable
// services the frontend offers in step 1 of the widget.
import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const servicesRouter = Router();

// GET /api/services — list bookable services with price, duration and deposit.
servicesRouter.get('/', async (_req, res) => {
  const services = await prisma.service.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      priceMinPence: true,
      priceMaxPence: true,
      durationMinutes: true,
      depositPence: true,
    },
  });
  res.json({ services });
});
