// Seeds the database with the salon's real services (from frontend/index.html),
// a starter set of technicians, and opening hours (from the site footer/panels).
//
// Prices are stored in pence. The frontend shows ranges in "$" but the salon is
// UK-based, so these are treated as GBP. Durations are NOT present in the markup
// and are sensible starting estimates — tune them here.
//
// Deposit is a flat £10 for every service by default; adjust per service as needed.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEPOSIT_PENCE = 1000; // £10 flat deposit to start.

// name, priceMin (£), priceMax (£), durationMinutes
const SERVICES: Array<[string, number, number, number]> = [
  ['Classic Manicure', 25, 35, 30],
  ['Gel Manicure', 40, 55, 45],
  ['Classic Pedicure', 35, 45, 45],
  ['Gel Pedicure', 50, 65, 60],
  ['Acrylic Set', 55, 80, 90],
  ['Nail Art', 15, 15, 30], // "from $15"
  ['Nail Extensions', 60, 90, 90],
  ['Nail Removal', 15, 15, 15],
  ['Paraffin Treatment', 20, 20, 20],
];

const STAFF = ['Mai', 'Linh', 'Sophie'];

// weekday: 0=Sunday .. 6=Saturday; minutes from midnight; null = closed.
// Mon closed; Tue–Sat 09:30–18:30; Sun 10:00–18:00.
const HOURS: Array<{ weekday: number; openMin: number | null; closeMin: number | null }> = [
  { weekday: 0, openMin: 10 * 60, closeMin: 18 * 60 }, // Sunday
  { weekday: 1, openMin: null, closeMin: null }, // Monday (closed)
  { weekday: 2, openMin: 9 * 60 + 30, closeMin: 18 * 60 + 30 }, // Tuesday
  { weekday: 3, openMin: 9 * 60 + 30, closeMin: 18 * 60 + 30 }, // Wednesday
  { weekday: 4, openMin: 9 * 60 + 30, closeMin: 18 * 60 + 30 }, // Thursday
  { weekday: 5, openMin: 9 * 60 + 30, closeMin: 18 * 60 + 30 }, // Friday
  { weekday: 6, openMin: 9 * 60 + 30, closeMin: 18 * 60 + 30 }, // Saturday
];

async function main() {
  // Services (idempotent upsert by unique name).
  const services = [];
  for (const [name, min, max, duration] of SERVICES) {
    const service = await prisma.service.upsert({
      where: { name },
      update: {
        priceMinPence: min * 100,
        priceMaxPence: max * 100,
        durationMinutes: duration,
        depositPence: DEPOSIT_PENCE,
        active: true,
      },
      create: {
        name,
        priceMinPence: min * 100,
        priceMaxPence: max * 100,
        durationMinutes: duration,
        depositPence: DEPOSIT_PENCE,
      },
    });
    services.push(service);
  }

  // Staff. Names aren't unique in the schema, so guard against duplicates by name.
  const staff = [];
  for (const name of STAFF) {
    const existing = await prisma.staff.findFirst({ where: { name } });
    const s = existing ?? (await prisma.staff.create({ data: { name } }));
    staff.push(s);
  }

  // MVP: every technician can perform every service.
  for (const s of staff) {
    for (const svc of services) {
      await prisma.staffService.upsert({
        where: { staffId_serviceId: { staffId: s.id, serviceId: svc.id } },
        update: {},
        create: { staffId: s.id, serviceId: svc.id },
      });
    }
  }

  // Business hours (idempotent by unique weekday).
  for (const h of HOURS) {
    await prisma.businessHours.upsert({
      where: { weekday: h.weekday },
      update: { openMin: h.openMin, closeMin: h.closeMin },
      create: h,
    });
  }

  console.log(
    `Seeded ${services.length} services, ${staff.length} staff, ${HOURS.length} weekday hour rows.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
