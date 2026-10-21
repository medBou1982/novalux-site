// Routes publiques : catalogue, actualités, réglages publics.
import { Router } from 'express';
import { query } from '../db.js';
import { getSettings } from '../settings.js';
import { ah, httpError, pagination, str } from '../util.js';

const router = Router();

// Résumé d'un produit pour les listes : prix mini/maxi, pastilles, image, disponibilité
const PRODUCT_CARD_SQL = `
  SELECT p.id, p.name, p.slug, p.quote_only, p.is_new, p.is_featured, p.created_at,
         c.name AS category_name, c.slug AS category_slug,
         (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY position, id LIMIT 1) AS image_url,
         agg.min_price, agg.max_price, agg.in_stock, agg.variant_count, agg.swatches
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN LATERAL (
      SELECT min(v.price) AS min_price, max(v.price) AS max_price,
             bool_or(v.stock > 0) AS in_stock, count(*)::int AS variant_count,
             (SELECT coalesce(json_agg(s.color_hex ORDER BY s.first_pos), '[]')
                FROM (SELECT color_hex, min(position) AS first_pos FROM variants
                       WHERE product_id = p.id AND is_active AND color_hex <> ''
                       GROUP BY color_hex) s) AS swatches
        FROM variants v WHERE v.product_id = p.id AND v.is_active
    ) agg ON true
`;

router.get('/settings', ah(async (_req, res) => {
  const s = await getSettings();
  res.json({ shipping: s.shipping, contact: s.contact });
}));

router.get('/categories', ah(async (_req, res) => {
  const { rows } = await query(`
    SELECT c.id, c.parent_id, c.name, c.slug, c.description, c.image_url, c.position,
           (SELECT count(*)::int FROM products p
             WHERE p.is_active AND (p.category_id = c.id OR p.category_id IN (SELECT id FROM categories WHERE parent_id = c.id))) AS product_count
      FROM categories c ORDER BY c.position, c.name`);
  res.json(rows);
}));

router.get('/categories/:slug', ah(async (req, res) => {
  const { rows: [cat] } = await query('SELECT * FROM categories WHERE slug = $1', [req.params.slug]);
  if (!cat) throw httpError(404, 'Cette gamme n’existe pas.');
  const { rows: children } = await query('SELECT id, name, slug FROM categories WHERE parent_id = $1 ORDER BY position, name', [cat.id]);
  const parent = cat.parent_id
    ? (await query('SELECT id, name, slug FROM categories WHERE id = $1', [cat.parent_id])).rows[0]
    : null;
  res.json({ ...cat, children, parent });
}));

router.get('/products', ah(async (req, res) => {
  const { page, size, offset } = pagination(req.query, 24);
  const where = ['p.is_active'];
  const params = [];
  if (req.query.category) {
    params.push(str(req.query.category));
    where.push(`(c.slug = $${params.length} OR c.parent_id = (SELECT id FROM categories WHERE slug = $${params.length}))`);
  }
  if (req.query.q) {
    params.push(`%${str(req.query.q, 100)}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length}
                 OR EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND (v.sku ILIKE $${params.length} OR v.option2 ILIKE $${params.length})))`);
  }
  if (req.query.featured === '1') where.push('p.is_featured');
  if (req.query.new === '1') where.push('p.is_new');

  const sorts = {
    recent: 'p.created_at DESC, p.id DESC',
    prix_asc: 'p.quote_only, agg.min_price ASC NULLS LAST, p.name',
    prix_desc: 'p.quote_only, agg.max_price DESC NULLS LAST, p.name',
    nom: 'p.name',
  };
  const order = sorts[req.query.tri] || 'p.is_featured DESC, p.name';
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const { rows } = await query(
    `${PRODUCT_CARD_SQL} ${whereSql} ORDER BY ${order} LIMIT ${size} OFFSET ${offset}`, params,
  );
  const { rows: [{ total }] } = await query(
    `SELECT count(*)::int AS total FROM products p LEFT JOIN categories c ON c.id = p.category_id ${whereSql}`, params,
  );
  res.json({ items: rows, total, page, size });
}));

router.get('/products/:slug', ah(async (req, res) => {
  const { rows: [product] } = await query(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
            pc.name AS parent_category_name, pc.slug AS parent_category_slug
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN categories pc ON pc.id = c.parent_id
      WHERE p.slug = $1 AND p.is_active`,
    [req.params.slug],
  );
  if (!product) throw httpError(404, 'Ce produit n’existe pas ou n’est plus en vente.');
  const [{ rows: variants }, { rows: images }, { rows: related }] = await Promise.all([
    query(`SELECT id, sku, option1, option2, color_hex, price, compare_price, stock
             FROM variants WHERE product_id = $1 AND is_active ORDER BY position, id`, [product.id]),
    query('SELECT id, url FROM product_images WHERE product_id = $1 ORDER BY position, id', [product.id]),
    query(`${PRODUCT_CARD_SQL} WHERE p.is_active AND p.id <> $1 AND p.category_id = $2 ORDER BY p.is_featured DESC LIMIT 4`,
      [product.id, product.category_id]),
  ]);
  res.json({ ...product, variants, images, related });
}));

router.get('/posts', ah(async (_req, res) => {
  const { rows } = await query(
    `SELECT id, title, slug, excerpt, image_url, published_at FROM posts
      WHERE published ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 50`,
  );
  res.json(rows);
}));

router.get('/posts/:slug', ah(async (req, res) => {
  const { rows: [post] } = await query('SELECT * FROM posts WHERE slug = $1 AND published', [req.params.slug]);
  if (!post) throw httpError(404, 'Cet article n’existe pas.');
  res.json(post);
}));

export default router;
