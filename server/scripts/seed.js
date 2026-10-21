// Données de démonstration Novalux.
// Les noms, références et teintes viennent du site actuel ; les PRIX et STOCKS sont
// des valeurs d'exemple à remplacer depuis l'admin.
import bcrypt from 'bcryptjs';
import { pool, tx } from '../src/db.js';

const DT = (n) => Math.round(n * 1000); // dinars -> millimes

// Nuancier de la peinture acrylique Novalux (référence, nom, teinte approximative)
const ACRYLIC_COLORS = [
  ['01', 'Blanc', '#F7F7F4'], ['02', 'Jaune primaire', '#F6D02F'], ['03', 'Magenta', '#C2185B'],
  ['04', 'Bleu roi', '#1F3A93'], ['05', 'Noir', '#1A1A1A'], ['06', 'Rouge', '#D32F2F'],
  ['07', 'Beige clair', '#EADBC0'], ['08', 'Rose bébé', '#F6C1CF'], ['09', 'Beige R', '#D8BE97'],
  ['10', 'Bleu ciel', '#7EC8E8'], ['11', 'Bleu marine', '#1B2A4A'], ['12', 'Bleu turquoise', '#1FA2B8'],
  ['13', 'Rose fushia', '#E0218A'], ['14', 'Gris', '#8E9196'], ['15', 'Rouge bordeaux', '#7B1E2B'],
  ['16', 'Saumon', '#F49A7E'], ['17', 'Vert émeraude', '#16855C'], ['18', 'Vert gazon', '#4CA33B'],
  ['19', 'Violet', '#6A3D9A'], ['20', 'Vert pistache', '#A8C66C'], ['21', 'Vio rose', '#B565A7'],
  ['22', 'Vert turquoise', '#21A694'], ['23', 'Marron', '#6B4226'], ['31', 'Orange', '#F28C28'],
  ['33', 'Cuivre', '#B5703A'], ['34', 'Jaune oxyde', '#D9A43B'], ['35', 'Marron clair', '#A0714F'],
  ['36', 'Greige', '#B9B2A5'],
];
const pick = (refs) => ACRYLIC_COLORS.filter(([r]) => refs.includes(r));

// Stock pseudo-aléatoire mais reproductible
let seed = 42;
const rnd = (min, max) => { seed = (seed * 9301 + 49297) % 233280; return min + Math.floor((seed / 233280) * (max - min + 1)); };

const CATEGORIES = [
  { key: 'ba', name: 'Beaux-arts', slug: 'beaux-arts', description: 'Peintures et effets pour artistes, loisirs créatifs et décoration.' },
  { key: 'indus', name: 'Gamme industrielle', slug: 'gamme-industrielle', description: 'Encres et pâtes colorantes pour l’industrie. Tarifs sur devis selon volumes.' },
  { key: 'acr', parent: 'ba', name: 'Acrylique', slug: 'acrylique', description: 'Peinture acrylique à l’eau, couvrante, pour tous supports.' },
  { key: 'tissu', parent: 'ba', name: 'Sur tissu', slug: 'sur-tissu', description: 'Peintures textiles, résistantes au lavage après fixation.' },
  { key: 'verre', parent: 'ba', name: 'Sur verre', slug: 'sur-verre', description: 'Peintures transparentes effet vitrail.' },
  { key: 'huile', parent: 'ba', name: 'Peinture à l’huile', slug: 'peinture-a-huile', description: 'Couleurs à l’huile fines pour le tableau.' },
  { key: 'effets', parent: 'ba', name: 'Effets et finitions', slug: 'effets-et-finitions', description: 'Gutta, paillettes et finitions décoratives.' },
];

// option1 = contenance, option2 = couleur
const PRODUCTS = [
  {
    cat: 'acr', name: 'Peinture acrylique', slug: 'peinture-acrylique', featured: true, isNew: true,
    description: 'Peinture acrylique à l’eau, mate et couvrante. Adhère sur toile, bois, carton, plâtre et murs. Séchage rapide, sans odeur, se nettoie à l’eau.',
    o1: 'Contenance', o2: 'Couleur',
    variants: [['60 g', 2.5, 'A060'], ['125 g', 4.5, 'A125'], ['500 g', 14, 'A500'], ['1 kg', 25, 'A1000']]
      .flatMap(([size, price, code]) => ACRYLIC_COLORS.map(([ref, name, hex]) => ({ sku: `${code}-${ref}`, o1: size, o2: `${name} ${ref}`, hex, price }))),
  },
  {
    cat: 'tissu', name: 'Peinture sur tissu', slug: 'peinture-sur-tissu', featured: true,
    description: 'Peinture textile souple pour coton, lin et toile. Fixer au fer à repasser (5 min, côté envers) pour une tenue au lavage jusqu’à 40 °C.',
    o1: 'Contenance', o2: 'Couleur',
    variants: pick(['01', '02', '04', '05', '06', '10', '13', '17', '19', '23', '31', '36'])
      .map(([ref, name, hex]) => ({ sku: `T060-${ref}`, o1: '60 g', o2: `${name} ${ref}`, hex, price: 3.2 })),
  },
  {
    cat: 'verre', name: 'Peinture sur verre', slug: 'peinture-sur-verre', featured: true,
    description: 'Couleurs transparentes à effet vitrail pour verre, miroir et plastique. À associer au cerne relief pour délimiter les motifs.',
    o1: 'Contenance', o2: 'Couleur',
    variants: pick(['02', '03', '04', '06', '10', '12', '17', '19', '31', '34'])
      .map(([ref, name, hex]) => ({ sku: `V060-${ref}`, o1: '60 ml', o2: `${name} ${ref}`, hex, price: 3.8 })),
  },
  {
    cat: 'huile', name: 'Peinture à l’huile', slug: 'peinture-a-huile', isNew: true,
    description: 'Peinture à l’huile fine, riche en pigments, pour la peinture de chevalet. Mélange et empâtements faciles.',
    o1: 'Contenance', o2: 'Couleur',
    variants: pick(['01', '05', '09']).map(([ref, name, hex]) => ({ sku: `PH125-${ref}`, o1: '125 g', o2: `${name} ${ref}`, hex, price: 56 })),
  },
  {
    cat: 'effets', name: 'Gutta nacrée sur tous supports', slug: 'gutta-nacree', isNew: true,
    description: 'Gutta en relief à effet nacré pour cerner les motifs sur verre, tissu, céramique ou bois.',
    o1: 'Contenance', o2: 'Teinte',
    variants: [['Or', '#C9A43A'], ['Argent', '#BFC4C9'], ['Nacre blanche', '#F1EEE8']]
      .map(([name, hex], i) => ({ sku: `GUT500-${i + 1}`, o1: '500 g', o2: name, hex, price: 18.5 })),
  },
  {
    cat: 'effets', name: 'Paillettes', slug: 'paillettes', isNew: true,
    description: 'Paillettes fines pour décoration, loisirs créatifs et finitions de peinture.',
    o1: 'Contenance', o2: 'Teinte',
    variants: [['Or', '#D4AF37'], ['Argent', '#C0C0C0'], ['Multicolore', '#9B59B6']]
      .map(([name, hex], i) => ({ sku: `PAI1000-${i + 1}`, o1: '1 kg', o2: name, hex, price: 32 })),
  },
  {
    cat: 'indus', name: 'Novaflex, encres flexo à l’eau', slug: 'novaflex-encres-flexo', quoteOnly: true, featured: true,
    description: 'Large gamme d’encres flexographiques à l’eau pour l’impression sur papier, carton et emballage. Teintes formulées à la demande selon votre nuancier.',
    o1: '', o2: '', variants: [],
  },
  {
    cat: 'indus', name: 'Novafoam, pâte colorante pour mousse PU flexible', slug: 'novafoam-pate-colorante', quoteOnly: true, isNew: true,
    description: 'Pâtes pigmentaires pour la coloration de la mousse polyuréthane flexible. Bonne dispersion, teintes stables. Conditionnement et teintes selon vos besoins.',
    o1: '', o2: '', variants: [],
  },
];

const POSTS = [
  {
    title: 'Nouveau : la peinture à l’huile Novalux',
    slug: 'nouveau-peinture-a-huile',
    excerpt: 'Une gamme de couleurs à l’huile fines rejoint nos produits beaux-arts.',
    content: 'Après l’acrylique, le tissu et le verre, Novalux lance sa peinture à l’huile en tube de 125 g.\n\nLes premières teintes sont disponibles dès maintenant dans la boutique et chez nos revendeurs.',
  },
  {
    title: 'Novalux au salon de l’emballage',
    slug: 'novalux-salon-emballage',
    excerpt: 'Retrouvez notre gamme d’encres flexo Novaflex sur notre stand.',
    content: 'Notre équipe technique présentera les encres flexographiques à l’eau Novaflex et répondra à vos demandes de formulation.\n\nPour préparer un rendez-vous, envoyez-nous une demande de devis depuis le site.',
  },
];

const SETTINGS = {
  shipping: { flat_fee: DT(7), free_threshold: DT(150) },
  contact: {
    phone: '+216 54 438 561',
    email: 'contact@novalux.com.tn',
    address: 'Route de l’aéroport km 4, ZI Oued Chaabouni, 3071 Sfax, Tunisie',
    facebook: 'https://www.facebook.com/people/Societe-Novalux/61550808002191/',
  },
};

try {
  await tx(async (c) => {
    const { rows: existing } = await c.query('SELECT count(*)::int AS n FROM products');
    if (existing[0].n > 0 && !process.argv.includes('--force')) {
      console.log('Des produits existent déjà : catalogue de démo non rechargé (utilisez --force ou npm run db:reset).');
    } else {
      const catIds = {};
      for (const [i, cat] of CATEGORIES.entries()) {
        const { rows } = await c.query(
          `INSERT INTO categories (parent_id, name, slug, description, position) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [cat.parent ? catIds[cat.parent] : null, cat.name, cat.slug, cat.description, i],
        );
        catIds[cat.key] = rows[0].id;
      }
      for (const p of PRODUCTS) {
        const { rows } = await c.query(
          `INSERT INTO products (category_id, name, slug, description, quote_only, is_featured, is_new, option1_name, option2_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [catIds[p.cat], p.name, p.slug, p.description, !!p.quoteOnly, !!p.featured, !!p.isNew, p.o1, p.o2],
        );
        const productId = rows[0].id;
        for (const [i, v] of p.variants.entries()) {
          await c.query(
            `INSERT INTO variants (product_id, sku, option1, option2, color_hex, price, stock, position)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [productId, v.sku, v.o1, v.o2, v.hex, DT(v.price), rnd(0, 6) === 0 ? rnd(0, 4) : rnd(10, 120), i],
          );
        }
      }
      for (const post of POSTS) {
        await c.query(
          `INSERT INTO posts (title, slug, excerpt, content, published, published_at)
           VALUES ($1,$2,$3,$4,true, now()) ON CONFLICT (slug) DO NOTHING`,
          [post.title, post.slug, post.excerpt, post.content],
        );
      }
      console.log(`Catalogue de démo chargé : ${PRODUCTS.length} produits.`);
    }

    for (const [key, value] of Object.entries(SETTINGS)) {
      await c.query('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(value)]);
    }

    const email = (process.env.ADMIN_EMAIL || 'admin@novalux.com.tn').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'ChangeMoi2026!';
    const { rowCount } = await c.query(
      'INSERT INTO admins (email, password_hash, name) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING',
      [email, await bcrypt.hash(password, 10), 'Administrateur'],
    );
    if (rowCount) console.log(`Compte admin créé : ${email} (mot de passe : variable ADMIN_PASSWORD)`);
  });
} catch (err) {
  console.error('Échec du chargement des données :', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
