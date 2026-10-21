// Back-office : toutes les routes exigent un jeton admin, sauf /login.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import rateLimit from 'express-rate-limit';
import { query, tx } from '../db.js';
import { requireAdmin, signToken } from '../auth.js';
import { getOrderWithItems, updateOrderStatus } from '../services/orders.js';
import { getSettings } from '../settings.js';
import { ah, bool, httpError, int, pagination, randomKey, slugify, str } from '../util.js';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
      cb(null, `${Date.now().toString(36)}-${randomKey(6)}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : httpError(400, 'Format d’image non accepté (JPEG, PNG, WebP, AVIF ou GIF).'), ok);
  },
});

const router = Router();

// ---------- Connexion ----------

router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' } }),
  ah(async (req, res) => {
    const email = str(req.body.email, 200).toLowerCase();
    const { rows: [a] } = await query('SELECT * FROM admins WHERE email = $1', [email]);
    if (!a || !(await bcrypt.compare(str(req.body.password, 200), a.password_hash))) {
      throw httpError(401, 'E-mail ou mot de passe incorrect.');
    }
    res.json({ token: signToken({ sub: a.id, role: 'admin', email: a.email }, '12h'), admin: { id: a.id, email: a.email, name: a.name } });
  }));

router.use(requireAdmin);

router.get('/me', ah(async (req, res) => {
  const { rows: [a] } = await query('SELECT id, email, name FROM admins WHERE id = $1', [req.admin.id]);
  if (!a) throw httpError(401, 'Compte admin introuvable.');
  res.json(a);
}));

router.put('/me/password', ah(async (req, res) => {
  const { rows: [a] } = await query('SELECT * FROM admins WHERE id = $1', [req.admin.id]);
  if (!(await bcrypt.compare(str(req.body.current), a.password_hash))) throw httpError(400, 'Mot de passe actuel incorrect.');
  if (str(req.body.next).length < 8) throw httpError(400, 'Le nouveau mot de passe doit faire au moins 8 caractères.');
  await query('UPDATE admins SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(str(req.body.next), 10), a.id]);
  res.json({ ok: true });
}));

// ---------- Tableau de bord ----------

router.get('/dashboard', ah(async (_req, res) => {
  const [kpi, daily, recent, lowStock, quotes] = await Promise.all([
    query(`SELECT
             coalesce(sum(total) FILTER (WHERE status <> 'annulee' AND status <> 'en_attente_paiement' AND created_at >= now() - interval '30 days'), 0)::int AS revenue_30d,
             count(*) FILTER (WHERE status <> 'annulee' AND status <> 'en_attente_paiement' AND created_at >= now() - interval '30 days')::int AS orders_30d,
             count(*) FILTER (WHERE status = 'nouvelle')::int AS to_process,
             count(*) FILTER (WHERE status = 'confirmee')::int AS to_ship
           FROM orders`),
    query(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
                  coalesce(sum(o.total), 0)::int AS revenue, count(o.id)::int AS orders
             FROM generate_series(current_date - 29, current_date, interval '1 day') d
             LEFT JOIN orders o ON o.created_at::date = d::date AND o.status NOT IN ('annulee','en_attente_paiement')
            GROUP BY d ORDER BY d`),
    query(`SELECT id, number, first_name, last_name, total, status, payment_method, payment_status, created_at
             FROM orders ORDER BY created_at DESC LIMIT 8`),
    query(`SELECT v.id, v.sku, v.option1, v.option2, v.color_hex, v.stock, p.id AS product_id, p.name AS product_name
             FROM variants v JOIN products p ON p.id = v.product_id
            WHERE v.is_active AND p.is_active AND v.stock <= 5
            ORDER BY v.stock, p.name LIMIT 12`),
    query(`SELECT id, number, company, first_name, last_name, status, created_at FROM quotes
            WHERE status IN ('nouveau','en_cours') ORDER BY created_at DESC LIMIT 6`),
  ]);
  const { rows: [{ low_total }] } = await query(
    `SELECT count(*)::int AS low_total FROM variants v JOIN products p ON p.id = v.product_id WHERE v.is_active AND p.is_active AND v.stock <= 5`,
  );
  res.json({
    ...kpi.rows[0], daily: daily.rows, recent_orders: recent.rows,
    low_stock: lowStock.rows, low_stock_total: low_total, open_quotes: quotes.rows,
  });
}));

// ---------- Catégories ----------

router.get('/categories', ah(async (_req, res) => {
  const { rows } = await query(`
    SELECT c.*, (SELECT count(*)::int FROM products p WHERE p.category_id = c.id) AS product_count
      FROM categories c ORDER BY c.position, c.name`);
  res.json(rows);
}));

async function uniqueSlug(table, base, excludeId = null) {
  let slug = slugify(base);
  for (let i = 2; ; i++) {
    const { rowCount } = await query(`SELECT 1 FROM ${table} WHERE slug = $1 AND ($2::int IS NULL OR id <> $2)`, [slug, excludeId]);
    if (!rowCount) return slug;
    slug = `${slugify(base)}-${i}`;
  }
}

function categoryFields(body) {
  const name = str(body.name, 120);
  if (!name) throw httpError(400, 'Certains champs sont à corriger.', { name: 'Le nom est obligatoire.' });
  return {
    name, description: str(body.description, 2000), image_url: str(body.image_url, 500),
    parent_id: body.parent_id ? int(body.parent_id) : null, position: int(body.position, 0),
  };
}

router.post('/categories', ah(async (req, res) => {
  const f = categoryFields(req.body);
  const slug = await uniqueSlug('categories', str(req.body.slug) || f.name);
  const { rows: [c] } = await query(
    'INSERT INTO categories (name, slug, description, image_url, parent_id, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [f.name, slug, f.description, f.image_url, f.parent_id, f.position],
  );
  res.status(201).json(c);
}));

router.put('/categories/:id', ah(async (req, res) => {
  const id = int(req.params.id);
  const f = categoryFields(req.body);
  if (f.parent_id === id) throw httpError(400, 'Une gamme ne peut pas être sa propre gamme parente.');
  const slug = await uniqueSlug('categories', str(req.body.slug) || f.name, id);
  const { rows: [c] } = await query(
    `UPDATE categories SET name=$1, slug=$2, description=$3, image_url=$4, parent_id=$5, position=$6 WHERE id=$7 RETURNING *`,
    [f.name, slug, f.description, f.image_url, f.parent_id, f.position, id],
  );
  if (!c) throw httpError(404, 'Gamme introuvable.');
  res.json(c);
}));

router.delete('/categories/:id', ah(async (req, res) => {
  const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM products WHERE category_id = $1', [int(req.params.id)]);
  if (n > 0) throw httpError(409, `Cette gamme contient ${n} produit(s). Déplacez-les avant de la supprimer.`);
  await query('DELETE FROM categories WHERE id = $1', [int(req.params.id)]);
  res.status(204).end();
}));

// ---------- Produits ----------

router.get('/products', ah(async (req, res) => {
  const { page, size, offset } = pagination(req.query, 25);
  const where = ['true'];
  const params = [];
  if (req.query.q) {
    params.push(`%${str(req.query.q, 100)}%`);
    where.push(`(p.name ILIKE $${params.length} OR EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.sku ILIKE $${params.length}))`);
  }
  if (req.query.category) { params.push(int(req.query.category)); where.push(`p.category_id = $${params.length}`); }
  if (req.query.status === 'actif') where.push('p.is_active');
  if (req.query.status === 'masque') where.push('NOT p.is_active');
  if (req.query.status === 'devis') where.push('p.quote_only');
  const w = `WHERE ${where.join(' AND ')}`;
  const { rows } = await query(
    `SELECT p.id, p.name, p.slug, p.is_active, p.quote_only, p.is_featured, p.is_new, p.updated_at,
            c.name AS category_name,
            (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY position, id LIMIT 1) AS image_url,
            (SELECT count(*)::int FROM variants v WHERE v.product_id = p.id) AS variant_count,
            (SELECT coalesce(sum(greatest(stock,0)),0)::int FROM variants v WHERE v.product_id = p.id AND v.is_active) AS stock_total,
            (SELECT count(*)::int FROM variants v WHERE v.product_id = p.id AND v.is_active AND v.stock <= 5) AS low_count,
            (SELECT min(price) FROM variants v WHERE v.product_id = p.id AND v.is_active) AS min_price,
            (SELECT max(price) FROM variants v WHERE v.product_id = p.id AND v.is_active) AS max_price,
            (SELECT color_hex FROM variants v WHERE v.product_id = p.id AND color_hex <> '' ORDER BY position LIMIT 1) AS color_hex
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       ${w} ORDER BY p.updated_at DESC LIMIT ${size} OFFSET ${offset}`, params,
  );
  const { rows: [{ total }] } = await query(`SELECT count(*)::int AS total FROM products p ${w}`, params);
  res.json({ items: rows, total, page, size });
}));

router.get('/products/:id', ah(async (req, res) => {
  const id = int(req.params.id);
  const { rows: [p] } = await query('SELECT * FROM products WHERE id = $1', [id]);
  if (!p) throw httpError(404, 'Produit introuvable.');
  const [{ rows: variants }, { rows: images }] = await Promise.all([
    query('SELECT * FROM variants WHERE product_id = $1 ORDER BY position, id', [id]),
    query('SELECT * FROM product_images WHERE product_id = $1 ORDER BY position, id', [id]),
  ]);
  res.json({ ...p, variants, images });
}));

function productFields(body) {
  const name = str(body.name, 200);
  if (!name) throw httpError(400, 'Certains champs sont à corriger.', { name: 'Le nom est obligatoire.' });
  return {
    name,
    category_id: body.category_id ? int(body.category_id) : null,
    description: str(body.description, 10000),
    quote_only: bool(body.quote_only),
    is_active: body.is_active === undefined ? true : bool(body.is_active),
    is_featured: bool(body.is_featured),
    is_new: bool(body.is_new),
    option1_name: str(body.option1_name, 60),
    option2_name: str(body.option2_name, 60),
  };
}

/** Synchronise la liste des variantes : met à jour, ajoute, supprime. */
async function syncVariants(c, productId, variants, quoteOnly) {
  if (!Array.isArray(variants)) return;
  const errors = {};
  const skus = new Set();
  variants.forEach((v, i) => {
    const sku = str(v.sku, 60);
    if (!sku) errors[`variants.${i}.sku`] = 'Référence obligatoire.';
    else if (skus.has(sku.toLowerCase())) errors[`variants.${i}.sku`] = `Référence « ${sku} » en double.`;
    skus.add(sku.toLowerCase());
    if (!quoteOnly && !(Number(v.price) >= 0)) errors[`variants.${i}.price`] = 'Prix invalide.';
    if (v.color_hex && !/^#[0-9a-fA-F]{6}$/.test(v.color_hex)) errors[`variants.${i}.color_hex`] = 'Couleur au format #RRGGBB.';
  });
  if (Object.keys(errors).length) throw httpError(400, 'Certaines variantes sont à corriger.', errors);

  const keepIds = variants.map((v) => int(v.id, 0)).filter(Boolean);
  await c.query('DELETE FROM variants WHERE product_id = $1 AND NOT (id = ANY($2::int[]))', [productId, keepIds]);
  for (const [i, v] of variants.entries()) {
    const vals = [str(v.sku, 60), str(v.option1, 80), str(v.option2, 80), str(v.color_hex, 7),
      Math.max(0, int(v.price, 0)), v.compare_price ? Math.max(0, int(v.compare_price)) : null,
      int(v.stock, 0), i, v.is_active === undefined ? true : bool(v.is_active)];
    try {
      if (int(v.id, 0)) {
        await c.query(
          `UPDATE variants SET sku=$1, option1=$2, option2=$3, color_hex=$4, price=$5, compare_price=$6, stock=$7, position=$8, is_active=$9
            WHERE id=$10 AND product_id=$11`, [...vals, int(v.id), productId],
        );
      } else {
        await c.query(
          `INSERT INTO variants (sku, option1, option2, color_hex, price, compare_price, stock, position, is_active, product_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [...vals, productId],
        );
      }
    } catch (err) {
      if (err.code === '23505') throw httpError(409, `La référence « ${vals[0]} » est déjà utilisée par un autre produit.`, { [`variants.${i}.sku`]: 'Référence déjà utilisée.' });
      throw err;
    }
  }
}

router.post('/products', ah(async (req, res) => {
  const f = productFields(req.body);
  const slug = await uniqueSlug('products', str(req.body.slug) || f.name);
  const id = await tx(async (c) => {
    const { rows: [p] } = await c.query(
      `INSERT INTO products (name, slug, category_id, description, quote_only, is_active, is_featured, is_new, option1_name, option2_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [f.name, slug, f.category_id, f.description, f.quote_only, f.is_active, f.is_featured, f.is_new, f.option1_name, f.option2_name],
    );
    await syncVariants(c, p.id, req.body.variants || [], f.quote_only);
    return p.id;
  });
  res.status(201).json({ id, slug });
}));

router.put('/products/:id', ah(async (req, res) => {
  const id = int(req.params.id);
  const f = productFields(req.body);
  const slug = await uniqueSlug('products', str(req.body.slug) || f.name, id);
  await tx(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE products SET name=$1, slug=$2, category_id=$3, description=$4, quote_only=$5, is_active=$6, is_featured=$7,
              is_new=$8, option1_name=$9, option2_name=$10, updated_at=now() WHERE id=$11`,
      [f.name, slug, f.category_id, f.description, f.quote_only, f.is_active, f.is_featured, f.is_new, f.option1_name, f.option2_name, id],
    );
    if (!rowCount) throw httpError(404, 'Produit introuvable.');
    await syncVariants(c, id, req.body.variants, f.quote_only);
  });
  res.json({ id, slug });
}));

router.delete('/products/:id', ah(async (req, res) => {
  const { rows: images } = await query('SELECT url FROM product_images WHERE product_id = $1', [int(req.params.id)]);
  await query('DELETE FROM products WHERE id = $1', [int(req.params.id)]);
  images.forEach((img) => removeUpload(img.url));
  res.status(204).end();
}));

// Modification rapide du stock / prix d'une variante (depuis la liste)
router.patch('/variants/:id', ah(async (req, res) => {
  const sets = [];
  const params = [];
  if (req.body.stock !== undefined) { params.push(int(req.body.stock)); sets.push(`stock = $${params.length}`); }
  if (req.body.price !== undefined) { params.push(Math.max(0, int(req.body.price))); sets.push(`price = $${params.length}`); }
  if (!sets.length) throw httpError(400, 'Rien à modifier.');
  params.push(int(req.params.id));
  const { rows: [v] } = await query(`UPDATE variants SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!v) throw httpError(404, 'Variante introuvable.');
  res.json(v);
}));

// ---------- Images ----------

const uploadUrl = (filename) => `/uploads/${filename}`;
function removeUpload(url) {
  if (!url?.startsWith('/uploads/')) return;
  fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => {});
}

router.post('/products/:id/images', upload.array('images', 10), ah(async (req, res) => {
  const id = int(req.params.id);
  const { rows: [{ max }] } = await query('SELECT coalesce(max(position), -1)::int AS max FROM product_images WHERE product_id = $1', [id]);
  const out = [];
  for (const [i, file] of (req.files || []).entries()) {
    const { rows: [img] } = await query(
      'INSERT INTO product_images (product_id, url, position) VALUES ($1,$2,$3) RETURNING *',
      [id, uploadUrl(file.filename), max + 1 + i],
    );
    out.push(img);
  }
  res.status(201).json(out);
}));

router.put('/products/:id/images/order', ah(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map((x) => int(x)) : [];
  await tx(async (c) => {
    for (const [i, imgId] of ids.entries()) {
      await c.query('UPDATE product_images SET position = $1 WHERE id = $2 AND product_id = $3', [i, imgId, int(req.params.id)]);
    }
  });
  res.json({ ok: true });
}));

router.delete('/images/:id', ah(async (req, res) => {
  const { rows: [img] } = await query('DELETE FROM product_images WHERE id = $1 RETURNING url', [int(req.params.id)]);
  if (img) removeUpload(img.url);
  res.status(204).end();
}));

// Image isolée (gammes, actualités)
router.post('/uploads', upload.single('image'), (req, res) => {
  if (!req.file) throw httpError(400, 'Aucune image reçue.');
  res.status(201).json({ url: uploadUrl(req.file.filename) });
});

// ---------- Commandes ----------

router.get('/orders', ah(async (req, res) => {
  const { page, size, offset } = pagination(req.query, 25);
  const where = ['true'];
  const params = [];
  if (req.query.status) { params.push(str(req.query.status)); where.push(`status = $${params.length}`); }
  if (req.query.payment) { params.push(str(req.query.payment)); where.push(`payment_method = $${params.length}`); }
  if (req.query.q) {
    params.push(`%${str(req.query.q, 100)}%`);
    where.push(`(number ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length}
                 OR (first_name || ' ' || last_name) ILIKE $${params.length})`);
  }
  const w = `WHERE ${where.join(' AND ')}`;
  const { rows } = await query(
    `SELECT id, number, first_name, last_name, email, phone, city, total, status, payment_method, payment_status, created_at,
            (SELECT coalesce(sum(quantity),0)::int FROM order_items oi WHERE oi.order_id = orders.id) AS item_count
       FROM orders ${w} ORDER BY created_at DESC LIMIT ${size} OFFSET ${offset}`, params,
  );
  const { rows: [{ total }] } = await query(`SELECT count(*)::int AS total FROM orders ${w}`, params);
  const { rows: counts } = await query('SELECT status, count(*)::int AS n FROM orders GROUP BY status');
  res.json({ items: rows, total, page, size, counts: Object.fromEntries(counts.map((r) => [r.status, r.n])) });
}));

router.get('/orders/:id', ah(async (req, res) => {
  const order = await getOrderWithItems('id = $1', [int(req.params.id)]);
  if (!order) throw httpError(404, 'Commande introuvable.');
  res.json(order);
}));

const ORDER_STATUSES = ['en_attente_paiement', 'nouvelle', 'confirmee', 'expediee', 'livree', 'annulee'];
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

router.patch('/orders/:id', ah(async (req, res) => {
  const { status, payment_status } = req.body;
  if (status && !ORDER_STATUSES.includes(status)) throw httpError(400, 'Statut inconnu.');
  if (payment_status && !PAYMENT_STATUSES.includes(payment_status)) throw httpError(400, 'Statut de paiement inconnu.');
  const updated = await updateOrderStatus(int(req.params.id), { status, payment_status });
  if (req.body.admin_note !== undefined) {
    await query('UPDATE orders SET notes = $1 WHERE id = $2', [str(req.body.admin_note, 2000), updated.id]);
  }
  res.json(await getOrderWithItems('id = $1', [updated.id]));
}));

// ---------- Devis ----------

router.get('/quotes', ah(async (req, res) => {
  const { page, size, offset } = pagination(req.query, 25);
  const where = ['true'];
  const params = [];
  if (req.query.status) { params.push(str(req.query.status)); where.push(`status = $${params.length}`); }
  if (req.query.q) {
    params.push(`%${str(req.query.q, 100)}%`);
    where.push(`(number ILIKE $${params.length} OR email ILIKE $${params.length} OR company ILIKE $${params.length}
                 OR (first_name || ' ' || last_name) ILIKE $${params.length})`);
  }
  const w = `WHERE ${where.join(' AND ')}`;
  const { rows } = await query(
    `SELECT q.*, (SELECT count(*)::int FROM quote_items qi WHERE qi.quote_id = q.id) AS item_count
       FROM quotes q ${w} ORDER BY created_at DESC LIMIT ${size} OFFSET ${offset}`, params,
  );
  const { rows: [{ total }] } = await query(`SELECT count(*)::int AS total FROM quotes ${w}`, params);
  const { rows: counts } = await query('SELECT status, count(*)::int AS n FROM quotes GROUP BY status');
  res.json({ items: rows, total, page, size, counts: Object.fromEntries(counts.map((r) => [r.status, r.n])) });
}));

router.get('/quotes/:id', ah(async (req, res) => {
  const { rows: [q] } = await query('SELECT * FROM quotes WHERE id = $1', [int(req.params.id)]);
  if (!q) throw httpError(404, 'Demande de devis introuvable.');
  const { rows: items } = await query(
    `SELECT qi.*, p.slug AS product_slug FROM quote_items qi LEFT JOIN products p ON p.id = qi.product_id
      WHERE qi.quote_id = $1 ORDER BY qi.id`, [q.id],
  );
  res.json({ ...q, items });
}));

router.patch('/quotes/:id', ah(async (req, res) => {
  const status = req.body.status;
  if (status && !['nouveau', 'en_cours', 'envoye', 'accepte', 'refuse'].includes(status)) throw httpError(400, 'Statut inconnu.');
  const { rows: [q] } = await query(
    `UPDATE quotes SET status = coalesce($1, status), admin_notes = coalesce($2, admin_notes), updated_at = now()
      WHERE id = $3 RETURNING *`,
    [status || null, req.body.admin_notes !== undefined ? str(req.body.admin_notes, 5000) : null, int(req.params.id)],
  );
  if (!q) throw httpError(404, 'Demande de devis introuvable.');
  res.json(q);
}));

// ---------- Clients ----------

router.get('/customers', ah(async (req, res) => {
  const { page, size, offset } = pagination(req.query, 25);
  const params = [];
  let w = '';
  if (req.query.q) {
    params.push(`%${str(req.query.q, 100)}%`);
    w = `WHERE email ILIKE $1 OR phone ILIKE $1 OR company ILIKE $1 OR (first_name || ' ' || last_name) ILIKE $1`;
  }
  const { rows } = await query(
    `SELECT c.id, c.email, c.first_name, c.last_name, c.phone, c.company, c.city, c.created_at,
            (c.password_hash IS NOT NULL) AS has_account,
            count(o.id) FILTER (WHERE o.status <> 'annulee')::int AS order_count,
            coalesce(sum(o.total) FILTER (WHERE o.status NOT IN ('annulee','en_attente_paiement')), 0)::int AS total_spent,
            max(o.created_at) AS last_order_at
       FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
       ${w} GROUP BY c.id ORDER BY last_order_at DESC NULLS LAST, c.created_at DESC
       LIMIT ${size} OFFSET ${offset}`, params,
  );
  const { rows: [{ total }] } = await query(`SELECT count(*)::int AS total FROM customers ${w}`, params);
  res.json({ items: rows, total, page, size });
}));

router.get('/customers/:id', ah(async (req, res) => {
  const id = int(req.params.id);
  const { rows: [c] } = await query(
    `SELECT id, email, first_name, last_name, phone, company, address, city, postal_code, created_at,
            (password_hash IS NOT NULL) AS has_account FROM customers WHERE id = $1`, [id],
  );
  if (!c) throw httpError(404, 'Client introuvable.');
  const [{ rows: orders }, { rows: quotes }] = await Promise.all([
    query('SELECT id, number, total, status, payment_method, payment_status, created_at FROM orders WHERE customer_id = $1 ORDER BY created_at DESC', [id]),
    query('SELECT id, number, status, created_at FROM quotes WHERE customer_id = $1 OR lower(email) = lower($2) ORDER BY created_at DESC', [id, c.email]),
  ]);
  res.json({ ...c, orders, quotes });
}));

// ---------- Actualités ----------

router.get('/posts', ah(async (_req, res) => {
  const { rows } = await query('SELECT id, title, slug, excerpt, image_url, published, published_at, created_at FROM posts ORDER BY created_at DESC');
  res.json(rows);
}));

router.get('/posts/:id', ah(async (req, res) => {
  const { rows: [p] } = await query('SELECT * FROM posts WHERE id = $1', [int(req.params.id)]);
  if (!p) throw httpError(404, 'Article introuvable.');
  res.json(p);
}));

async function savePost(req, id = null) {
  const title = str(req.body.title, 200);
  if (!title) throw httpError(400, 'Certains champs sont à corriger.', { title: 'Le titre est obligatoire.' });
  const slug = await uniqueSlug('posts', str(req.body.slug) || title, id);
  const published = bool(req.body.published);
  const vals = [title, slug, str(req.body.excerpt, 500), str(req.body.content, 50000), str(req.body.image_url, 500), published];
  if (id) {
    const { rows: [p] } = await query(
      `UPDATE posts SET title=$1, slug=$2, excerpt=$3, content=$4, image_url=$5, published=$6,
              published_at = CASE WHEN $6 AND published_at IS NULL THEN now() ELSE published_at END
        WHERE id = $7 RETURNING *`, [...vals, id],
    );
    if (!p) throw httpError(404, 'Article introuvable.');
    return p;
  }
  const { rows: [p] } = await query(
    `INSERT INTO posts (title, slug, excerpt, content, image_url, published, published_at)
     VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $6 THEN now() END) RETURNING *`, vals,
  );
  return p;
}

router.post('/posts', ah(async (req, res) => res.status(201).json(await savePost(req))));
router.put('/posts/:id', ah(async (req, res) => res.json(await savePost(req, int(req.params.id)))));
router.delete('/posts/:id', ah(async (req, res) => {
  await query('DELETE FROM posts WHERE id = $1', [int(req.params.id)]);
  res.status(204).end();
}));

// ---------- Réglages ----------

router.get('/settings', ah(async (_req, res) => res.json(await getSettings())));

router.put('/settings', ah(async (req, res) => {
  const s = req.body || {};
  const next = {
    shipping: {
      flat_fee: Math.max(0, int(s.shipping?.flat_fee, 0)),
      free_threshold: Math.max(0, int(s.shipping?.free_threshold, 0)),
    },
    contact: {
      phone: str(s.contact?.phone, 40), email: str(s.contact?.email, 200),
      address: str(s.contact?.address, 300), facebook: str(s.contact?.facebook, 300),
    },
  };
  for (const [key, value] of Object.entries(next)) {
    await query('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, JSON.stringify(value)]);
  }
  res.json(await getSettings());
}));

export default router;
