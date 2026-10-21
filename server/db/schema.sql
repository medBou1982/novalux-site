-- Novalux e-commerce schema (PostgreSQL 14+)
-- Prices are stored as integers in millimes (1 DT = 1000 millimes) to avoid rounding errors.

CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,                       -- NULL = client invité (commande sans compte)
  first_name    TEXT NOT NULL DEFAULT '',
  last_name     TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  company       TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  postal_code   TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  parent_id   INT REFERENCES categories(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL DEFAULT '',
  position    INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id           SERIAL PRIMARY KEY,
  category_id  INT REFERENCES categories(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL DEFAULT '',
  quote_only   BOOLEAN NOT NULL DEFAULT false,  -- true = « sur devis », pas de prix ni de panier
  is_active    BOOLEAN NOT NULL DEFAULT true,
  is_featured  BOOLEAN NOT NULL DEFAULT false,  -- « Les incontournables »
  is_new       BOOLEAN NOT NULL DEFAULT false,  -- « Les nouveautés »
  option1_name TEXT NOT NULL DEFAULT '',        -- ex. « Contenance »
  option2_name TEXT NOT NULL DEFAULT '',        -- ex. « Couleur »
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id);

CREATE TABLE IF NOT EXISTS product_images (
  id         SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  position   INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS variants (
  id            SERIAL PRIMARY KEY,
  product_id    INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku           TEXT NOT NULL UNIQUE,
  option1       TEXT NOT NULL DEFAULT '',
  option2       TEXT NOT NULL DEFAULT '',
  color_hex     TEXT NOT NULL DEFAULT '',       -- pastille affichée dans le nuancier
  price         INT  NOT NULL DEFAULT 0 CHECK (price >= 0),        -- millimes
  compare_price INT  CHECK (compare_price IS NULL OR compare_price >= 0),
  stock         INT  NOT NULL DEFAULT 0,
  position      INT  NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS variants_product_idx ON variants(product_id);

CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  number         TEXT NOT NULL UNIQUE,
  access_key     TEXT NOT NULL,                -- permet au client invité de consulter sa commande
  customer_id    INT REFERENCES customers(id) ON DELETE SET NULL,
  email          TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  phone          TEXT NOT NULL,
  address        TEXT NOT NULL,
  city           TEXT NOT NULL,
  postal_code    TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cod','online')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
  payment_ref    TEXT,
  status         TEXT NOT NULL DEFAULT 'nouvelle'
                 CHECK (status IN ('en_attente_paiement','nouvelle','confirmee','expediee','livree','annulee')),
  subtotal       INT NOT NULL,
  shipping       INT NOT NULL DEFAULT 0,
  total          INT NOT NULL,
  stock_released BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id    INT REFERENCES variants(id) ON DELETE SET NULL,
  product_name  TEXT NOT NULL,
  variant_label TEXT NOT NULL DEFAULT '',
  sku           TEXT NOT NULL,
  unit_price    INT NOT NULL,
  quantity      INT NOT NULL CHECK (quantity > 0),
  line_total    INT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotes (
  id          SERIAL PRIMARY KEY,
  number      TEXT NOT NULL UNIQUE,
  customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
  company     TEXT NOT NULL DEFAULT '',
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL,
  city        TEXT NOT NULL DEFAULT '',
  message     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','en_cours','envoye','accepte','refuse')),
  admin_notes TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quote_items (
  id            SERIAL PRIMARY KEY,
  quote_id      INT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id    INT REFERENCES products(id) ON DELETE SET NULL,
  variant_id    INT REFERENCES variants(id) ON DELETE SET NULL,
  product_name  TEXT NOT NULL,
  variant_label TEXT NOT NULL DEFAULT '',
  quantity      TEXT NOT NULL DEFAULT '1'      -- texte libre : « 200 kg », « 3 fûts »…
);

CREATE TABLE IF NOT EXISTS posts (
  id           SERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  excerpt      TEXT NOT NULL DEFAULT '',
  content      TEXT NOT NULL DEFAULT '',
  image_url    TEXT NOT NULL DEFAULT '',
  published    BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS quote_number_seq START 501;
