// Captures d'écran des pages principales (exécuté par la CI, API démarrée sur :4000).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.SITE_URL || 'http://localhost:4000';
const OUT = process.argv[2] || 'captures';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const shot = async (page, name, full = true) => {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(900); // animations du nuancier
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
};

for (const [label, viewport] of [['desktop', { width: 1366, height: 860 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'fr-FR' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`[${label}] erreur JS :`, e.message));

  await page.goto(`${BASE}/`);
  await shot(page, `${label}-01-accueil`);

  await page.goto(`${BASE}/gamme/beaux-arts`);
  await shot(page, `${label}-02-gamme`);

  await page.goto(`${BASE}/produit/peinture-acrylique?teinte=${encodeURIComponent('Bleu turquoise 12')}`);
  await shot(page, `${label}-03-produit`);
  await page.getByRole('button', { name: 'Ajouter au panier' }).click();
  await page.waitForTimeout(300);
  await shot(page, `${label}-04-ajout`, false);

  await page.goto(`${BASE}/produit/novafoam-pate-colorante`);
  await shot(page, `${label}-05-produit-devis`);

  await page.goto(`${BASE}/panier`);
  await shot(page, `${label}-06-panier`);
  await page.goto(`${BASE}/commande`);
  await shot(page, `${label}-07-commande`);
  await ctx.close();
}

// Admin
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'fr-FR' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('[admin] erreur JS :', e.message));
await page.goto(`${BASE}/admin`);
await shot(page, 'admin-00-connexion', false);
await page.getByLabel('E-mail').fill(process.env.ADMIN_EMAIL);
await page.getByLabel('Mot de passe').fill(process.env.ADMIN_PASSWORD);
await page.getByRole('button', { name: 'Se connecter' }).click();
await page.getByRole('heading', { name: 'Tableau de bord' }).waitFor();
await shot(page, 'admin-01-tableau-de-bord');
await page.goto(`${BASE}/admin/commandes`);
await shot(page, 'admin-02-commandes');
await page.locator('table a').first().click();
await shot(page, 'admin-03-commande');
await page.goto(`${BASE}/admin/produits`);
await shot(page, 'admin-04-produits');
await page.goto(`${BASE}/admin/produits/1`);
await shot(page, 'admin-05-produit');
await page.goto(`${BASE}/admin/devis`);
await shot(page, 'admin-06-devis');

await browser.close();
console.log('Captures terminées.');
