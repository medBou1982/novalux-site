// Tests de bout en bout de l'API. Nécessitent une API démarrée sur une base fraîchement chargée :
//   npm run db:reset && npm start   puis   API_BASE=http://localhost:4000 npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.API_BASE || 'http://localhost:4000';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@novalux.com.tn', password: process.env.ADMIN_PASSWORD || 'ChangeMoi2026!' };

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

const contact = (email) => ({
  first_name: 'Sami', last_name: 'Ben Ali', email, phone: '+216 20 123 456', address: '12 rue de la Liberté', city: 'Sfax', postal_code: '3000',
});

const freshVariants = async () => (await api('/products/peinture-acrylique')).data.variants;

let adminToken;
let acrylic;

before(async () => {
  const login = await api('/admin/login', { method: 'POST', body: ADMIN });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  adminToken = login.data.token;
  acrylic = (await api('/products/peinture-acrylique')).data;
});

test('santé et réglages publics', async () => {
  assert.equal((await api('/health')).status, 200);
  const s = await api('/settings');
  assert.equal(s.data.shipping.flat_fee, 7000);
  assert.ok(s.data.contact.phone);
});

test('catalogue : gammes, liste, filtres, fiche produit', async () => {
  const cats = await api('/categories');
  assert.ok(cats.data.find((c) => c.slug === 'beaux-arts').product_count >= 6);

  const all = await api('/products');
  assert.equal(all.data.total, 8);
  const card = all.data.items.find((p) => p.slug === 'peinture-acrylique');
  assert.equal(card.swatches.length, 28);
  assert.equal(card.min_price, 2500);

  const indus = await api('/products?category=gamme-industrielle');
  assert.equal(indus.data.total, 2);
  assert.ok(indus.data.items.every((p) => p.quote_only));

  assert.ok((await api('/products?new=1')).data.total >= 4);
  assert.equal((await api('/products?q=turquoise')).data.items[0].slug, 'peinture-acrylique');

  assert.equal(acrylic.option1_name, 'Contenance');
  assert.equal(acrylic.variants.length, 112);
  assert.equal(acrylic.parent_category_slug, 'beaux-arts');
  assert.equal((await api('/products/inexistant')).status, 404);
});

test('commande paiement à la livraison : stock décrémenté, frais de port', async () => {
  const v = (await freshVariants()).find((x) => x.stock >= 3);
  const r = await api('/orders', {
    method: 'POST',
    body: { items: [{ variant_id: v.id, quantity: 2 }, { variant_id: v.id, quantity: 1 }], contact: contact('sami@example.tn'), payment_method: 'cod' },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.total, v.price * 3 + (v.price * 3 >= 150000 ? 0 : 7000));
  assert.equal(r.data.pay_url, null);

  const after = (await api('/products/peinture-acrylique')).data.variants.find((x) => x.id === v.id);
  assert.equal(after.stock, v.stock - 3);

  const view = await api(`/orders/${r.data.number}?cle=${r.data.access_key}`);
  assert.equal(view.status, 200);
  assert.equal(view.data.status, 'nouvelle');
  assert.equal(view.data.items[0].quantity, 3);
  assert.equal(view.data.access_key, undefined);
  assert.equal((await api(`/orders/${r.data.number}?cle=mauvaise`)).status, 404);
});

test('commande refusée : stock insuffisant, produit sur devis, champs manquants', async () => {
  const v = acrylic.variants[0];
  const tooMany = await api('/orders', { method: 'POST', body: { items: [{ variant_id: v.id, quantity: 999 }], contact: contact('a@example.tn'), payment_method: 'cod' } });
  assert.equal(tooMany.status, 409);
  assert.equal(tooMany.data.details.items[0].variant_id, v.id);

  const bad = await api('/orders', { method: 'POST', body: { items: [{ variant_id: v.id, quantity: 1 }], contact: { email: 'x' }, payment_method: 'cod' } });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.details.first_name && bad.data.details.email);

  const empty = await api('/orders', { method: 'POST', body: { items: [], contact: contact('a@example.tn'), payment_method: 'cod' } });
  assert.equal(empty.status, 400);
});

test('paiement en ligne simulé : succès puis échec avec remise en stock', async () => {
  const v = (await freshVariants()).find((x) => x.stock >= 2);
  const ok = await api('/orders', { method: 'POST', body: { items: [{ variant_id: v.id, quantity: 1 }], contact: contact('online@example.tn'), payment_method: 'online' } });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const url = new URL(ok.data.pay_url);
  assert.equal(url.pathname, '/paiement/simulation');
  const paid = await api('/payments/simulation', { method: 'POST', body: { ref: url.searchParams.get('ref'), number: ok.data.number, cle: ok.data.access_key, result: 'paid' } });
  assert.deepEqual(paid.data, { status: 'nouvelle', payment_status: 'paid' });

  const before = (await api('/products/peinture-acrylique')).data.variants.find((x) => x.id === v.id).stock;
  const ko = await api('/orders', { method: 'POST', body: { items: [{ variant_id: v.id, quantity: 1 }], contact: contact('online@example.tn'), payment_method: 'online' } });
  const ref = new URL(ko.data.pay_url).searchParams.get('ref');
  const failed = await api('/payments/simulation', { method: 'POST', body: { ref, number: ko.data.number, cle: ko.data.access_key, result: 'failed' } });
  assert.deepEqual(failed.data, { status: 'annulee', payment_status: 'failed' });
  const afterFail = (await api('/products/peinture-acrylique')).data.variants.find((x) => x.id === v.id).stock;
  assert.equal(afterFail, before);
});

test('demande de devis pour un produit industriel', async () => {
  const novafoam = (await api('/products/novafoam-pate-colorante')).data;
  assert.equal(novafoam.quote_only, true);
  assert.equal(novafoam.variants.length, 0);

  const q = await api('/quotes', {
    method: 'POST',
    body: { company: 'Mousse Sud SARL', first_name: 'Lina', last_name: 'Trabelsi', email: 'lina@moussesud.tn', phone: '74 000 111', items: [{ product_id: novafoam.id, quantity: '200 kg' }], message: 'Teinte bleu roi.' },
  });
  assert.equal(q.status, 201);
  assert.match(q.data.number, /^DV-/);

  const list = await api('/admin/quotes?status=nouveau', { token: adminToken });
  const created = list.data.items.find((x) => x.number === q.data.number);
  assert.equal(created.item_count, 1);
  const detail = await api(`/admin/quotes/${created.id}`, { token: adminToken });
  assert.equal(detail.data.items[0].quantity, '200 kg');
  const upd = await api(`/admin/quotes/${created.id}`, { method: 'PATCH', token: adminToken, body: { status: 'envoye', admin_notes: 'Offre envoyée le 22/10' } });
  assert.equal(upd.data.status, 'envoye');
});

test('compte client : inscription, connexion, historique', async () => {
  const reg = await api('/account/register', { method: 'POST', body: { first_name: 'Mouna', last_name: 'Kallel', email: 'mouna@example.tn', password: 'motdepasse1' } });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  assert.equal((await api('/account/register', { method: 'POST', body: { first_name: 'M', last_name: 'K', email: 'mouna@example.tn', password: 'motdepasse1' } })).status, 409);
  assert.equal((await api('/account/login', { method: 'POST', body: { email: 'mouna@example.tn', password: 'faux' } })).status, 401);
  const login = await api('/account/login', { method: 'POST', body: { email: 'MOUNA@example.tn', password: 'motdepasse1' } });
  assert.equal(login.status, 200);

  const v = (await freshVariants()).find((x) => x.stock >= 1);
  const o = await api('/orders', { method: 'POST', token: login.data.token, body: { items: [{ variant_id: v.id, quantity: 1 }], contact: contact('mouna@example.tn'), payment_method: 'cod' } });
  assert.equal(o.status, 201);
  const me = await api('/account/me', { token: login.data.token });
  assert.equal(me.data.orders.length, 1);
  assert.equal((await api(`/orders/${o.data.number}`, { token: login.data.token })).status, 200);
  assert.equal((await api('/account/me')).status, 401);
});

test('admin : accès protégé et tableau de bord', async () => {
  assert.equal((await api('/admin/dashboard')).status, 401);
  assert.equal((await api('/admin/login', { method: 'POST', body: { ...ADMIN, password: 'faux' } })).status, 401);
  const d = await api('/admin/dashboard', { token: adminToken });
  assert.equal(d.status, 200);
  assert.equal(d.data.daily.length, 30);
  assert.ok(d.data.orders_30d >= 3);
  assert.ok(d.data.revenue_30d > 0);
  assert.ok(Array.isArray(d.data.low_stock));
});

test('admin : cycle de vie d’une commande et annulation avec remise en stock', async () => {
  const stockOf = async (id) => (await api('/products/peinture-acrylique')).data.variants.find((x) => x.id === id).stock;
  const v = (await api('/products/peinture-acrylique')).data.variants.find((x) => x.stock >= 5);
  const o = await api('/orders', { method: 'POST', body: { items: [{ variant_id: v.id, quantity: 4 }], contact: contact('c@example.tn'), payment_method: 'cod' } });
  assert.equal(await stockOf(v.id), v.stock - 4);
  const list = await api(`/admin/orders?q=${o.data.number}`, { token: adminToken });
  const id = list.data.items[0].id;
  assert.equal((await api(`/admin/orders/${id}`, { method: 'PATCH', token: adminToken, body: { status: 'confirmee' } })).data.status, 'confirmee');
  const cancelled = await api(`/admin/orders/${id}`, { method: 'PATCH', token: adminToken, body: { status: 'annulee' } });
  assert.equal(cancelled.data.status, 'annulee');
  assert.equal(await stockOf(v.id), v.stock);
  // Annuler deux fois ne remet pas le stock deux fois
  await api(`/admin/orders/${id}`, { method: 'PATCH', token: adminToken, body: { status: 'annulee' } });
  assert.equal(await stockOf(v.id), v.stock);
  // Une commande annulée ne se réactive pas
  assert.equal((await api(`/admin/orders/${id}`, { method: 'PATCH', token: adminToken, body: { status: 'nouvelle' } })).status, 409);
});

test('admin : création, modification et suppression d’un produit avec variantes', async () => {
  const cats = (await api('/admin/categories', { token: adminToken })).data;
  const acr = cats.find((c) => c.slug === 'acrylique');
  const created = await api('/admin/products', {
    method: 'POST', token: adminToken,
    body: {
      name: 'Vernis acrylique', category_id: acr.id, description: 'Protège les peintures.', option1_name: 'Finition', option2_name: '',
      variants: [{ sku: 'VER-MAT', option1: 'Mat', price: 9500, stock: 20 }, { sku: 'VER-BRI', option1: 'Brillant', price: 9500, stock: 0 }],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.slug, 'vernis-acrylique');

  const dup = await api('/admin/products', { method: 'POST', token: adminToken, body: { name: 'X', variants: [{ sku: 'A060-01', price: 1 }] } });
  assert.equal(dup.status, 409);

  const full = (await api(`/admin/products/${created.data.id}`, { token: adminToken })).data;
  assert.equal(full.variants.length, 2);
  const upd = await api(`/admin/products/${created.data.id}`, {
    method: 'PUT', token: adminToken,
    body: { ...full, is_new: true, variants: [{ ...full.variants[0], stock: 15 }, { sku: 'VER-SAT', option1: 'Satiné', price: 9900, stock: 8 }] },
  });
  assert.equal(upd.status, 200, JSON.stringify(upd.data));
  const pub = (await api('/products/vernis-acrylique')).data;
  assert.deepEqual(pub.variants.map((x) => x.sku), ['VER-MAT', 'VER-SAT']);
  assert.equal(pub.variants[0].stock, 15);

  const quick = await api(`/admin/variants/${pub.variants[1].id}`, { method: 'PATCH', token: adminToken, body: { stock: 3 } });
  assert.equal(quick.data.stock, 3);

  assert.equal((await api(`/admin/products/${created.data.id}`, { method: 'DELETE', token: adminToken })).status, 204);
  assert.equal((await api('/products/vernis-acrylique')).status, 404);
});

test('admin : gammes, clients, actualités, réglages', async () => {
  const cat = await api('/admin/categories', { method: 'POST', token: adminToken, body: { name: 'Pinceaux & outils' } });
  assert.equal(cat.data.slug, 'pinceaux-outils');
  const acr = (await api('/admin/categories', { token: adminToken })).data.find((c) => c.slug === 'acrylique');
  assert.equal((await api(`/admin/categories/${acr.id}`, { method: 'DELETE', token: adminToken })).status, 409);
  assert.equal((await api(`/admin/categories/${cat.data.id}`, { method: 'DELETE', token: adminToken })).status, 204);

  const customers = await api('/admin/customers?q=sami', { token: adminToken });
  assert.ok(customers.data.items[0].order_count >= 1);
  const c = await api(`/admin/customers/${customers.data.items[0].id}`, { token: adminToken });
  assert.ok(c.data.orders.length >= 1);

  const post = await api('/admin/posts', { method: 'POST', token: adminToken, body: { title: 'Brouillon test', content: 'x' } });
  assert.equal((await api(`/posts/${post.data.slug}`)).status, 404);
  await api(`/admin/posts/${post.data.id}`, { method: 'PUT', token: adminToken, body: { ...post.data, published: true } });
  assert.equal((await api(`/posts/${post.data.slug}`)).status, 200);

  const s = await api('/admin/settings', { method: 'PUT', token: adminToken, body: { shipping: { flat_fee: 8000, free_threshold: 200000 }, contact: { phone: '+216 54 438 561', email: 'contact@novalux.com.tn', address: 'Sfax', facebook: '' } } });
  assert.equal(s.data.shipping.flat_fee, 8000);
  await api('/admin/settings', { method: 'PUT', token: adminToken, body: { shipping: { flat_fee: 7000, free_threshold: 150000 }, contact: s.data.contact } });
});
