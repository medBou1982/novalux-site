# Novalux : boutique en ligne

Site e-commerce de Novalux (peintures beaux-arts et colorants industriels, Sfax) :

- **Boutique React** : nuancier, gammes, fiches produit avec variantes (contenance × couleur), panier, commande, demande de devis, compte client facultatif, actualités.
- **API Node.js / Express** avec **PostgreSQL**.
- **Interface admin** sur `/admin` : tableau de bord, commandes, devis, produits et variantes, gammes, clients, actualités, réglages.

## Fonctionnement de la vente

| Cas | Ce qui se passe |
|---|---|
| Produit avec prix | Ajout au panier, puis paiement **à la livraison** ou **en ligne** (Konnect : carte, e-DINAR, portefeuille). |
| Produit « sur devis » (case dans l’admin, ex. Novaflex, Novafoam) | Pas de prix ni de panier : le client l’ajoute à une **demande de devis** avec une quantité libre (« 200 kg »). |
| Formulaire de contact | Enregistré comme une demande sans produit, visible dans « Devis ». |

Le stock est réservé à la commande et remis automatiquement en cas d’annulation ou d’échec du paiement en ligne.
Les montants sont stockés en **millimes** (1 DT = 1000) pour éviter les erreurs d’arrondi.

## Démarrer en local

Prérequis : Node.js 20+ et PostgreSQL 14+ (ou Docker).

```bash
# 1. Base de données
docker compose up -d                # ou utilisez votre propre PostgreSQL

# 2. API
cd server
cp .env.example .env                # puis ajustez si besoin
npm install
npm run db:reset                    # crée les tables + catalogue de démo + compte admin
npm run dev                         # http://localhost:4000

# 3. Site (dans un autre terminal)
cd client
npm install
npm run dev                         # http://localhost:5175
```

Admin : <http://localhost:5175/admin>, avec `ADMIN_EMAIL` / `ADMIN_PASSWORD` du fichier `.env`
(par défaut `admin@novalux.com.tn` / `ChangeMoi2026!`, **à changer** dans Réglages).

> Les noms, références et teintes du catalogue de démo viennent du site actuel.
> **Les prix et stocks sont des valeurs d’exemple** à corriger dans l’admin.

## Paiement en ligne Konnect

Sans clé, le paiement en ligne fonctionne en **mode simulé** : le client arrive sur une page de démonstration qui confirme ou refuse le paiement. Pour encaisser réellement :

1. Ouvrez un compte marchand sur [konnect.network](https://konnect.network) et récupérez la clé API et l’identifiant du portefeuille.
2. Dans `server/.env` : `KONNECT_API_KEY`, `KONNECT_WALLET_ID`, et `KONNECT_API_URL` (sandbox pour tester, puis production).
3. `API_URL` doit être l’adresse publique de l’API : Konnect y appelle `/api/payments/konnect/webhook` après le paiement.

Le statut est toujours revérifié auprès de Konnect avant de marquer une commande comme payée.

## Mise en production

```bash
cd client && npm ci && npm run build      # produit client/dist
cd ../server && npm ci && NODE_ENV=production npm start
```

L’API sert alors aussi le site compilé : un seul processus Node derrière Nginx ou un hébergeur Node, plus une base PostgreSQL.
Variables obligatoires en production : `DATABASE_URL`, `JWT_SECRET` (longue chaîne aléatoire), `PUBLIC_URL`, `API_URL`, `CORS_ORIGINS`.
Les photos envoyées depuis l’admin sont stockées dans `server/uploads/` (ou `UPLOAD_DIR`) : ce dossier doit être conservé entre deux déploiements.

## Tests

La CI GitHub (`.github/workflows/ci.yml`) démarre PostgreSQL, charge la démo, lance l’API, exécute les tests de bout en bout (`server/test/api.test.js`) et compile le front à chaque push.

En local, avec l’API démarrée sur une base fraîchement chargée :

```bash
cd server && npm run db:reset && npm start   # terminal 1
cd server && npm test                        # terminal 2
```

## Arborescence

```
server/
  db/schema.sql          tables PostgreSQL
  scripts/               migration, données de démo, création d’admin
  src/routes/catalog.js  catalogue public
  src/routes/shop.js     commande, paiement, devis, compte client
  src/routes/admin.js    back-office
  src/services/orders.js stock, statuts, paiement
  src/payments/konnect.js
  test/api.test.js
client/
  src/pages/             pages de la boutique
  src/admin/             interface admin (chargée à part)
  src/lib/               appels API, panier, formats
  src/styles/
```
