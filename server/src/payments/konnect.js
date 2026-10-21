// Paiement en ligne via Konnect (https://konnect.network).
// Sans KONNECT_API_KEY, le module fonctionne en mode simulé : le client est envoyé
// vers une page de démonstration du site qui confirme ou refuse le paiement.

const apiUrl = () => (process.env.KONNECT_API_URL || 'https://api.sandbox.konnect.network/api/v2').replace(/\/$/, '');
export const isMockMode = () => !process.env.KONNECT_API_KEY;

/**
 * Crée une session de paiement et renvoie { payUrl, paymentRef }.
 * `order` : ligne de la table orders (montant en millimes).
 */
export async function initPayment(order) {
  const publicUrl = (process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
  const returnUrl = `${publicUrl}/commande/${order.number}?cle=${order.access_key}`;

  if (isMockMode()) {
    const paymentRef = `SIMU-${order.number}-${Date.now().toString(36)}`;
    return {
      paymentRef,
      payUrl: `${publicUrl}/paiement/simulation?ref=${encodeURIComponent(paymentRef)}&commande=${order.number}&cle=${order.access_key}`,
    };
  }

  const apiPublicUrl = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
  const res = await fetch(`${apiUrl()}/payments/init-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.KONNECT_API_KEY },
    body: JSON.stringify({
      receiverWalletId: process.env.KONNECT_WALLET_ID,
      token: 'TND',
      amount: order.total, // Konnect attend des millimes pour le TND
      type: 'immediate',
      description: `Commande Novalux ${order.number}`,
      acceptedPaymentMethods: ['wallet', 'bank_card', 'e-DINAR'],
      lifespan: 30,
      checkoutForm: false,
      addPaymentFeesToAmount: false,
      firstName: order.first_name,
      lastName: order.last_name,
      phoneNumber: order.phone,
      email: order.email,
      orderId: order.number,
      webhook: `${apiPublicUrl}/api/payments/konnect/webhook`,
      successUrl: returnUrl,
      failUrl: returnUrl,
      theme: 'light',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Konnect init-payment a répondu ${res.status} : ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return { payUrl: data.payUrl, paymentRef: data.paymentRef };
}

/** Interroge Konnect et renvoie 'paid', 'failed' ou 'pending'. */
export async function fetchPaymentStatus(paymentRef) {
  const res = await fetch(`${apiUrl()}/payments/${encodeURIComponent(paymentRef)}`, {
    headers: { 'x-api-key': process.env.KONNECT_API_KEY },
  });
  if (!res.ok) throw new Error(`Konnect payments/${paymentRef} a répondu ${res.status}`);
  const data = await res.json();
  const status = data?.payment?.status;
  if (status === 'completed') return 'paid';
  if (['failed', 'expired', 'canceled', 'cancelled', 'rejected'].includes(status)) return 'failed';
  return 'pending';
}
