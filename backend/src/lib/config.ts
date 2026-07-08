import 'dotenv/config';

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: num('PORT', 4000),
  corsOrigins: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  minLeadMinutes: num('MIN_LEAD_MINUTES', 60),
  slotGranularityMinutes: num('SLOT_GRANULARITY_MINUTES', 15),
  adminToken: process.env.ADMIN_TOKEN ?? '',
};
