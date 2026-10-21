import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, date, money } from '../lib/format.js';
import { ErrorBox, Loading, Swatch } from '../components/ui.jsx';

/** Confirmation et suivi d'une commande. */
export default function OrderStatus() {
  const { number } = useParams();
  const [params] = useSearchParams();
  const cle = params.get('cle') || '';
  const [checked, setChecked] = useState(false);

  // Au retour du paiement en ligne, on demande au serveur de revérifier le statut
  useEffect(() => {
    if (!cle) { setChecked(true); return; }
    api.post('/payments/check', { number, cle }).catch(() => {}).finally(() => setChecked(true));
  }, [number, cle]);

  const { data: o, error, loading, reload } = useFetch(
    () => (checked ? api.get(`/orders/${number}${cle ? `?cle=${encodeURIComponent(cle)}` : ''}`) : new Promise(() => {})),
    [number, cle, checked],
  );
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState(null);

  if (loading && !o) return <div className="wrap section"><Loading label="Chargement de votre commande…" /></div>;
  if (error) return <div className="wrap section"><ErrorBox error={error} /></div>;

  const awaiting = o.status === 'en_attente_paiement';
  const cancelled = o.status === 'annulee';
  const retry = async () => {
    setPaying(true);
    setPayError(null);
    try {
      const { pay_url } = await api.post(`/orders/${o.number}/pay`, { cle });
      window.location.assign(pay_url);
    } catch (err) { setPayError(err); setPaying(false); }
  };

  return (
    <div className="wrap section narrow">
      <header className="page-head">
        {cancelled ? <h1>Commande {o.number} annulée</h1>
          : awaiting ? <h1>Paiement en attente</h1>
            : <h1>Merci {o.first_name}, votre commande est enregistrée.</h1>}
        <p>
          {cancelled && o.payment_status === 'failed' && 'Le paiement n’a pas abouti, aucun montant n’a été débité. Les articles ont été remis en stock.'}
          {awaiting && 'Nous n’avons pas encore reçu la confirmation du paiement.'}
          {!cancelled && !awaiting && `Commande ${o.number} du ${date(o.created_at)}. Nous vous appelons au ${o.phone} pour confirmer la livraison.`}
        </p>
        {awaiting && cle && (
          <div className="row">
            <button type="button" className="btn" onClick={retry} disabled={paying}>{paying ? 'Redirection…' : 'Payer maintenant'}</button>
            <button type="button" className="btn btn--ghost" onClick={reload}>Actualiser</button>
          </div>
        )}
        <ErrorBox error={payError} />
      </header>

      <div className="receipt">
        <dl className="receipt__meta">
          <div><dt>Statut</dt><dd><span className={`badge badge--${o.status}`}>{ORDER_STATUS[o.status]}</span></dd></div>
          <div><dt>Paiement</dt><dd>{PAYMENT_METHOD[o.payment_method]} · {PAYMENT_STATUS[o.payment_status]}</dd></div>
          <div><dt>Livraison</dt><dd>{o.address}, {o.postal_code} {o.city}</dd></div>
        </dl>
        <ul className="receipt__lines">
          {o.items.map((it) => (
            <li key={it.id}>
              <span><Swatch hex={it.color_hex} size={14} /> {it.quantity} × {it.product_name} <small>{it.variant_label}</small></span>
              <span>{money(it.line_total)}</span>
            </li>
          ))}
          <li><span>Livraison</span><span>{o.shipping ? money(o.shipping) : 'Offerte'}</span></li>
          <li className="receipt__total"><span>Total</span><span>{money(o.total)}</span></li>
        </ul>
      </div>
      <p><Link to="/" className="link">Retour à la boutique</Link></p>
    </div>
  );
}

/** Page de démonstration utilisée tant que Konnect n'est pas configuré. */
export function PaymentSimulation() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ref = params.get('ref');
  const number = params.get('commande');
  const cle = params.get('cle');

  const finish = async (result) => {
    setBusy(true);
    try {
      await api.post('/payments/simulation', { ref, number, cle, result });
      navigate(`/commande/${number}?cle=${cle}`, { replace: true });
    } catch (err) { setError(err); setBusy(false); }
  };

  return (
    <div className="wrap section narrow">
      <div className="sim">
        <p className="sim__flag">Mode démonstration</p>
        <h1>Paiement de la commande {number}</h1>
        <p>Aucune clé Konnect n’est configurée sur le serveur, donc aucun paiement réel n’a lieu. En production, le client verrait ici la page sécurisée Konnect.</p>
        <ErrorBox error={error} />
        <div className="row">
          <button type="button" className="btn" disabled={busy} onClick={() => finish('paid')}>Simuler un paiement réussi</button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => finish('failed')}>Simuler un échec</button>
        </div>
      </div>
    </div>
  );
}
