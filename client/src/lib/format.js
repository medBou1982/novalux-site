// Montants en millimes -> « 14,000 DT »
const amountFmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
export const money = (millimes) => `${amountFmt.format((millimes || 0) / 1000)} DT`;

export const toMillimes = (dinars) => Math.round(Number(String(dinars).replace(',', '.')) * 1000) || 0;
export const toDinars = (millimes) => ((millimes || 0) / 1000).toFixed(3);

export const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
export const dateTime = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export const variantLabel = (v) => [v.option1, v.option2].filter(Boolean).join(' · ');

export function priceRange(min, max) {
  if (min == null) return '';
  return min === max ? money(min) : `dès ${money(min)}`;
}

export const ORDER_STATUS = {
  en_attente_paiement: 'En attente de paiement',
  nouvelle: 'Nouvelle',
  confirmee: 'Confirmée',
  expediee: 'Expédiée',
  livree: 'Livrée',
  annulee: 'Annulée',
};
export const PAYMENT_STATUS = { pending: 'En attente', paid: 'Payé', failed: 'Échoué', refunded: 'Remboursé' };
export const PAYMENT_METHOD = { cod: 'À la livraison', online: 'En ligne' };
export const QUOTE_STATUS = { nouveau: 'Nouveau', en_cours: 'En cours', envoye: 'Offre envoyée', accepte: 'Accepté', refuse: 'Refusé' };

/** Couleur de texte lisible sur une pastille */
export function textOn(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return '#121B33';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? '#121B33' : '#FFFFFF';
}
