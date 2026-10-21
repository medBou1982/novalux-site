import { query } from './db.js';

export const DEFAULT_SETTINGS = {
  shipping: { flat_fee: 7000, free_threshold: 150000 },
  contact: { phone: '', email: '', address: '', facebook: '' },
};

export async function getSettings(db = { query }) {
  const { rows } = await db.query('SELECT key, value FROM settings');
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) out[r.key] = { ...(out[r.key] || {}), ...r.value };
  return out;
}

export function shippingFor(subtotal, settings) {
  const { flat_fee, free_threshold } = settings.shipping;
  if (free_threshold > 0 && subtotal >= free_threshold) return 0;
  return flat_fee;
}
