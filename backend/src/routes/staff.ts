// Routes for technicians: GET /api/staff lists active technicians, optionally
// filtered to those who perform a given service (?serviceId=).
import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const staffRouter = Router();

// GET /api/staff — list active technicians.
// Optional ?serviceId=... filters to technicians who perform that service.
staffRouter.get('/', async (req, res) => {
  const serviceId = typeof req.query.serviceId === 'string' ? req.query.serviceId : undefined;

  const staff = await prisma.staff.findMany({
    where: {
      active: true,
      ...(serviceId ? { services: { some: { serviceId } } } : {}),
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  res.json({ staff });
});
