import { query, tx } from '../db.js';
import { getSettings, shippingFor } from '../settings.js';
import { httpError, randomKey } from '../util.js';

export const variantLabel = (v) => [v.option1, v.option2].filter(Boolean).join(' · ');

/**
 * Vérifie le panier, réserve le stock et enregistre la commande dans une transaction.
 * items : [{ variant_id, quantity }]
 */
export async function createOrder({ items, contact, notes, paymentMethod, customerId }) {
  if (!Array.isArray(items) || items.length === 0) throw httpError(400, 'Votre panier est vide.');
  if (!['cod', 'online'].includes(paymentMethod)) throw httpError(400, 'Mode de paiement inconnu.');

  // Regroupe les lignes identiques
  const wanted = new Map();
  for (const it of items) {
    const id = Number.parseInt(it.variant_id, 10);
    const qty = Number.parseInt(it.quantity, 10);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1 || qty > 999) {
      throw httpError(400, 'Une ligne du panier est invalide.');
    }
    wanted.set(id, (wanted.get(id) || 0) + qty);
  }

  return tx(async (c) => {
    const ids = [...wanted.keys()];
    const { rows: variants } = await c.query(
      `SELECT v.*, p.name AS product_name, p.quote_only, p.is_active AS product_active
         FROM variants v JOIN products p ON p.id = v.product_id
        WHERE v.id = ANY($1::int[])
        ORDER BY v.id
        FOR UPDATE OF v`,
      [ids],
    );

    const problems = [];
    for (const id of ids) {
      const v = variants.find((x) => x.id === id);
      const qty = wanted.get(id);
      if (!v || !v.is_active || !v.product_active) problems.push({ variant_id: id, message: 'Article indisponible.' });
      else if (v.quote_only) problems.push({ variant_id: id, message: `${v.product_name} est vendu sur devis uniquement.` });
      else if (v.stock < qty) {
        problems.push({
          variant_id: id,
          available: Math.max(0, v.stock),
          message: v.stock > 0
            ? `Il reste ${v.stock} × ${v.product_name} (${variantLabel(v)}).`
            : `${v.product_name} (${variantLabel(v)}) est en rupture de stock.`,
        });
      }
    }
    if (problems.length) throw httpError(409, 'Certains articles ne sont plus disponibles dans la quantité demandée.', { items: problems });

    const settings = await getSettings(c);
    const lines = ids.map((id) => {
      const v = variants.find((x) => x.id === id);
      const qty = wanted.get(id);
      return { v, qty, total: v.price * qty };
    });
    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    const shipping = shippingFor(subtotal, settings);

    // Rattache la commande à un client (compte connecté ou fiche invité)
    let custId = customerId || null;
    if (!custId) {
      const { rows } = await c.query(
        `INSERT INTO customers (email, first_name, last_name, phone, address, city, postal_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING id`,
        [contact.email, contact.first_name, contact.last_name, contact.phone, contact.address, contact.city, contact.postal_code || ''],
      );
      custId = rows[0].id;
    }

    const { rows: seq } = await c.query("SELECT nextval('order_number_seq') AS n");
    const number = `NV-${seq[0].n}`;
    const online = paymentMethod === 'online';

    const { rows: [order] } = await c.query(
      `INSERT INTO orders (number, access_key, customer_id, email, first_name, last_name, phone, address, city, postal_code,
                           notes, payment_method, status, subtotal, shipping, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [number, randomKey(12), custId, contact.email, contact.first_name, contact.last_name, contact.phone,
        contact.address, contact.city, contact.postal_code || '', notes || '', paymentMethod,
        online ? 'en_attente_paiement' : 'nouvelle', subtotal, shipping, subtotal + shipping],
    );

    for (const { v, qty, total } of lines) {
      await c.query(
        `INSERT INTO order_items (order_id, variant_id, product_name, variant_label, sku, unit_price, quantity, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [order.id, v.id, v.product_name, variantLabel(v), v.sku, v.price, qty, total],
      );
      await c.query('UPDATE variants SET stock = stock - $1 WHERE id = $2', [qty, v.id]);
    }
    return order;
  });
}

/** Remet en stock les articles d'une commande (une seule fois). */
async function releaseStock(c, orderId) {
  const { rowCount } = await c.query(
    'UPDATE orders SET stock_released = true WHERE id = $1 AND stock_released = false', [orderId],
  );
  if (!rowCount) return;
  await c.query(
    `UPDATE variants v SET stock = v.stock + oi.quantity
       FROM order_items oi WHERE oi.order_id = $1 AND oi.variant_id = v.id`,
    [orderId],
  );
}

/** Met à jour statut / statut de paiement, en gérant le stock à l'annulation. */
export async function updateOrderStatus(orderId, { status, payment_status }) {
  return tx(async (c) => {
    const { rows: [order] } = await c.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!order) throw httpError(404, 'Commande introuvable.');

    const nextStatus = status || order.status;
    const nextPayment = payment_status || order.payment_status;

    if (order.status === 'annulee' && nextStatus !== 'annulee') {
      throw httpError(409, 'Une commande annulée ne peut pas être réactivée : créez une nouvelle commande.');
    }
    if (nextStatus === 'annulee') await releaseStock(c, order.id);

    const { rows: [updated] } = await c.query(
      'UPDATE orders SET status = $1, payment_status = $2, updated_at = now() WHERE id = $3 RETURNING *',
      [nextStatus, nextPayment, order.id],
    );
    return updated;
  });
}

/** Appliqué au retour du prestataire de paiement. */
export async function applyPaymentResult(orderId, result) {
  const { rows: [order] } = await query('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (!order || order.payment_status === 'paid') return order;
  if (result === 'paid') {
    return updateOrderStatus(order.id, {
      payment_status: 'paid',
      status: order.status === 'en_attente_paiement' ? 'nouvelle' : order.status,
    });
  }
  if (result === 'failed') {
    return updateOrderStatus(order.id, { payment_status: 'failed', status: 'annulee' });
  }
  return order;
}

export async function getOrderWithItems(where, params) {
  const { rows: [order] } = await query(`SELECT * FROM orders WHERE ${where}`, params);
  if (!order) return null;
  const { rows: items } = await query(
    `SELECT oi.*, p.slug AS product_slug, v.color_hex
       FROM order_items oi
       LEFT JOIN variants v ON v.id = oi.variant_id
       LEFT JOIN products p ON p.id = v.product_id
      WHERE oi.order_id = $1 ORDER BY oi.id`,
    [order.id],
  );
  return { ...order, items };
}

/** Version publique d'une commande (sans champs internes). */
export function publicOrder(o) {
  const { access_key, stock_released, customer_id, ...rest } = o;
  return rest;
}
