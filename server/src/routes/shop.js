// Routes client : commande, paiement, demande de devis, compte.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query, tx } from '../db.js';
import { optionalCustomer, requireCustomer, signToken } from '../auth.js';
import { applyPaymentResult, createOrder, getOrderWithItems, publicOrder } from '../services/orders.js';
import { fetchPaymentStatus, initPayment, isMockMode } from '../payments/konnect.js';
import { ah, httpError, requireFields, str } from '../util.js';

const router = Router();

const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.FORM_RATE_LIMIT || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});

const CONTACT_FIELDS = {
  first_name: 'Le prénom',
  last_name: 'Le nom',
  email: ['L’e-mail', 'email'],
  phone: ['Le téléphone', 'phone'],
  address: 'L’adresse',
  city: 'La ville',
};

// ---------- Commande ----------

router.post('/orders', formLimiter, optionalCustomer, ah(async (req, res) => {
  const contact = requireFields(req.body.contact, CONTACT_FIELDS);
  contact.postal_code = str(req.body.contact?.postal_code, 10);
  const paymentMethod = req.body.payment_method;

  let customerId = req.customer?.id || null;
  // Création de compte facultative au moment de la commande
  const password = str(req.body.create_account_password, 200);
  if (!customerId && password) {
    if (password.length < 8) throw httpError(400, 'Certains champs sont à corriger.', { create_account_password: 'Le mot de passe doit faire au moins 8 caractères.' });
    customerId = await upsertAccount(contact, password);
  }

  const order = await createOrder({
    items: req.body.items, contact, notes: str(req.body.notes, 1000), paymentMethod, customerId,
  });

  let payUrl = null;
  if (paymentMethod === 'online') {
    try {
      const payment = await initPayment(order);
      await query('UPDATE orders SET payment_ref = $1 WHERE id = $2', [payment.paymentRef, order.id]);
      payUrl = payment.payUrl;
    } catch (err) {
      console.error('[paiement]', err.message);
      await applyPaymentResult(order.id, 'failed');
      throw httpError(502, 'Le service de paiement en ligne ne répond pas. Choisissez le paiement à la livraison ou réessayez plus tard.');
    }
  }

  res.status(201).json({
    number: order.number, access_key: order.access_key, total: order.total, pay_url: payUrl,
    token: customerId && !req.customer ? signToken({ sub: customerId, role: 'customer', email: contact.email }) : undefined,
  });
}));

// Suivi d'une commande : clé d'accès (invité) ou compte du client
router.get('/orders/:number', optionalCustomer, ah(async (req, res) => {
  const order = await getOrderWithItems('number = $1', [req.params.number]);
  const allowed = order && (order.access_key === req.query.cle || (req.customer && order.customer_id === req.customer.id));
  if (!allowed) throw httpError(404, 'Commande introuvable. Vérifiez le lien reçu après votre achat.');
  res.json(publicOrder(order));
}));

// Relance du paiement en ligne d'une commande non payée
router.post('/orders/:number/pay', ah(async (req, res) => {
  const { rows: [order] } = await query('SELECT * FROM orders WHERE number = $1 AND access_key = $2', [req.params.number, str(req.body.cle)]);
  if (!order) throw httpError(404, 'Commande introuvable.');
  if (order.payment_method !== 'online' || order.status !== 'en_attente_paiement') throw httpError(409, 'Cette commande n’attend pas de paiement en ligne.');
  const payment = await initPayment(order);
  await query('UPDATE orders SET payment_ref = $1 WHERE id = $2', [payment.paymentRef, order.id]);
  res.json({ pay_url: payment.payUrl });
}));

// ---------- Paiement ----------

// Webhook Konnect : GET ?payment_ref=...  (on revérifie toujours le statut auprès de Konnect)
router.get('/payments/konnect/webhook', ah(async (req, res) => {
  const ref = str(req.query.payment_ref, 200);
  if (!ref || isMockMode()) return res.status(400).json({ error: 'Référence de paiement manquante.' });
  const { rows: [order] } = await query('SELECT id FROM orders WHERE payment_ref = $1', [ref]);
  if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
  const result = await fetchPaymentStatus(ref);
  await applyPaymentResult(order.id, result);
  res.json({ ok: true, result });
}));

// Retour client sur le site : vérifie le statut si le webhook n'est pas encore passé
router.post('/payments/check', ah(async (req, res) => {
  const { rows: [order] } = await query('SELECT * FROM orders WHERE number = $1 AND access_key = $2', [str(req.body.number), str(req.body.cle)]);
  if (!order) throw httpError(404, 'Commande introuvable.');
  if (order.payment_ref && order.payment_status === 'pending' && !isMockMode()) {
    await applyPaymentResult(order.id, await fetchPaymentStatus(order.payment_ref));
  }
  const { rows: [fresh] } = await query('SELECT status, payment_status FROM orders WHERE id = $1', [order.id]);
  res.json(fresh);
}));

// Mode simulé uniquement (pas de clé Konnect) : la page de démonstration confirme ou refuse
router.post('/payments/simulation', ah(async (req, res) => {
  if (!isMockMode()) throw httpError(404, 'Introuvable.');
  const { rows: [order] } = await query(
    'SELECT * FROM orders WHERE payment_ref = $1 AND number = $2 AND access_key = $3',
    [str(req.body.ref), str(req.body.number), str(req.body.cle)],
  );
  if (!order) throw httpError(404, 'Paiement introuvable.');
  const updated = await applyPaymentResult(order.id, req.body.result === 'paid' ? 'paid' : 'failed');
  res.json({ status: updated.status, payment_status: updated.payment_status });
}));

// ---------- Devis ----------

router.post('/quotes', formLimiter, optionalCustomer, ah(async (req, res) => {
  const f = requireFields(req.body, {
    first_name: 'Le prénom', last_name: 'Le nom', email: ['L’e-mail', 'email'], phone: ['Le téléphone', 'phone'],
  });
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 50) : [];
  const message = str(req.body.message, 3000);
  if (!items.length && !message) {
    throw httpError(400, 'Certains champs sont à corriger.', { message: 'Décrivez votre besoin ou ajoutez un produit à la demande.' });
  }

  const quote = await tx(async (c) => {
    const { rows: [{ n }] } = await c.query("SELECT nextval('quote_number_seq') AS n");
    const { rows: [q] } = await c.query(
      `INSERT INTO quotes (number, customer_id, company, first_name, last_name, email, phone, city, message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, number`,
      [`DV-${n}`, req.customer?.id || null, str(req.body.company, 200), f.first_name, f.last_name, f.email, f.phone,
        str(req.body.city, 100), message],
    );
    for (const it of items) {
      const productId = Number.parseInt(it.product_id, 10);
      const { rows: [p] } = await c.query('SELECT id, name FROM products WHERE id = $1', [productId]);
      if (!p) continue;
      let label = '';
      let variantId = null;
      if (it.variant_id) {
        const { rows: [v] } = await c.query('SELECT id, option1, option2 FROM variants WHERE id = $1 AND product_id = $2', [it.variant_id, p.id]);
        if (v) { variantId = v.id; label = [v.option1, v.option2].filter(Boolean).join(' · '); }
      }
      await c.query(
        `INSERT INTO quote_items (quote_id, product_id, variant_id, product_name, variant_label, quantity)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [q.id, p.id, variantId, p.name, label, str(String(it.quantity ?? '1'), 60) || '1'],
      );
    }
    return q;
  });
  res.status(201).json({ number: quote.number });
}));

// ---------- Compte client ----------

async function upsertAccount(contact, password) {
  const hash = await bcrypt.hash(password, 10);
  const { rows: [existing] } = await query('SELECT id, password_hash FROM customers WHERE email = $1', [contact.email]);
  if (existing?.password_hash) {
    throw httpError(409, 'Un compte existe déjà avec cet e-mail. Connectez-vous pour continuer.', { email: 'Compte existant : connectez-vous.' });
  }
  if (existing) {
    await query(
      `UPDATE customers SET password_hash = $1, first_name = $2, last_name = $3, phone = $4,
              address = $5, city = $6, postal_code = $7 WHERE id = $8`,
      [hash, contact.first_name, contact.last_name, contact.phone || '', contact.address || '', contact.city || '', contact.postal_code || '', existing.id],
    );
    return existing.id;
  }
  const { rows: [created] } = await query(
    `INSERT INTO customers (email, password_hash, first_name, last_name, phone, address, city, postal_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [contact.email, hash, contact.first_name, contact.last_name, contact.phone || '', contact.address || '', contact.city || '', contact.postal_code || ''],
  );
  return created.id;
}

router.post('/account/register', formLimiter, ah(async (req, res) => {
  const f = requireFields(req.body, { first_name: 'Le prénom', last_name: 'Le nom', email: ['L’e-mail', 'email'], password: 'Le mot de passe' });
  if (f.password.length < 8) throw httpError(400, 'Certains champs sont à corriger.', { password: 'Le mot de passe doit faire au moins 8 caractères.' });
  const id = await upsertAccount({ ...f, phone: str(req.body.phone, 30) }, f.password);
  res.status(201).json({ token: signToken({ sub: id, role: 'customer', email: f.email }) });
}));

router.post('/account/login', formLimiter, ah(async (req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  const { rows: [c] } = await query('SELECT id, email, password_hash FROM customers WHERE email = $1', [email]);
  if (!c?.password_hash || !(await bcrypt.compare(str(req.body.password, 200), c.password_hash))) {
    throw httpError(401, 'E-mail ou mot de passe incorrect.');
  }
  res.json({ token: signToken({ sub: c.id, role: 'customer', email: c.email }) });
}));

router.get('/account/me', requireCustomer, ah(async (req, res) => {
  const { rows: [c] } = await query(
    'SELECT id, email, first_name, last_name, phone, company, address, city, postal_code, created_at FROM customers WHERE id = $1',
    [req.customer.id],
  );
  if (!c) throw httpError(401, 'Compte introuvable.');
  const { rows: orders } = await query(
    `SELECT number, status, payment_status, payment_method, total, created_at
       FROM orders WHERE customer_id = $1 ORDER BY created_at DESC`, [c.id],
  );
  const { rows: quotes } = await query(
    'SELECT number, status, created_at FROM quotes WHERE customer_id = $1 ORDER BY created_at DESC', [c.id],
  );
  res.json({ ...c, orders, quotes });
}));

router.put('/account/me', requireCustomer, ah(async (req, res) => {
  const f = requireFields(req.body, { first_name: 'Le prénom', last_name: 'Le nom' });
  await query(
    `UPDATE customers SET first_name = $1, last_name = $2, phone = $3, company = $4, address = $5, city = $6, postal_code = $7
      WHERE id = $8`,
    [f.first_name, f.last_name, str(req.body.phone, 30), str(req.body.company, 200), str(req.body.address, 300),
      str(req.body.city, 100), str(req.body.postal_code, 10), req.customer.id],
  );
  res.json({ ok: true });
}));

export default router;
