import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { money } from '../lib/format.js';
import { Field } from '../components/ui.jsx';
import { Summary } from './Cart.jsx';

const CITIES = ['Sfax', 'Tunis', 'Ariana', 'Ben Arous', 'Manouba', 'Nabeul', 'Zaghouan', 'Bizerte', 'Béja', 'Jendouba', 'Le Kef', 'Siliana',
  'Sousse', 'Monastir', 'Mahdia', 'Kairouan', 'Kasserine', 'Sidi Bouzid', 'Gabès', 'Médenine', 'Tataouine', 'Gafsa', 'Tozeur', 'Kébili'];

export default function Checkout() {
  const { cart, account, total, clearCart, login } = useStore();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => ({
    first_name: account?.first_name || '', last_name: account?.last_name || '', email: account?.email || '',
    phone: account?.phone || '', address: account?.address || '', city: account?.city || 'Sfax', postal_code: account?.postal_code || '',
  }));
  const [payment, setPayment] = useState('cod');
  const [notes, setNotes] = useState('');
  const [createAccount, setCreateAccount] = useState(false);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Le compte peut se charger après l'affichage : on préremplit les champs encore vides
  useEffect(() => {
    if (!account) return;
    setForm((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v || account[k] || ''])));
  }, [account]);

  if (!cart.length) return <Navigate to="/panier" replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setErrors({});
    setMessage('');
    try {
      const res = await api.post('/orders', {
        items: cart.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity })),
        contact: form, notes, payment_method: payment,
        create_account_password: !account && createAccount ? password : undefined,
      });
      if (res.token) await login(res.token);
      clearCart();
      if (res.pay_url) window.location.assign(res.pay_url);
      else navigate(`/commande/${res.number}?cle=${res.access_key}`, { replace: true });
    } catch (err) {
      setErrors(err.details || {});
      const stockIssues = err.details?.items;
      setMessage(stockIssues ? stockIssues.map((x) => x.message).join(' ') : err.message);
      setSending(false);
    }
  };

  return (
    <div className="wrap section">
      <header className="page-head"><h1>Commande</h1></header>
      <form className="checkout" onSubmit={submit} noValidate>
        <div className="form">
          <section className="form__block">
            <h2>Livraison</h2>
            {!account && <p className="muted">Déjà client ? <Link to="/connexion?retour=/commande" className="link">Connectez-vous</Link> pour remplir automatiquement.</p>}
            <div className="form__grid">
              <Field label="Prénom" value={form.first_name} onChange={set('first_name')} error={errors.first_name} autoComplete="given-name" required />
              <Field label="Nom" value={form.last_name} onChange={set('last_name')} error={errors.last_name} autoComplete="family-name" required />
              <Field label="E-mail" type="email" value={form.email} onChange={set('email')} error={errors.email} autoComplete="email" required />
              <Field label="Téléphone" type="tel" value={form.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" placeholder="ex. 54 438 561" required />
              <Field label="Adresse" className="span-2" value={form.address} onChange={set('address')} error={errors.address} autoComplete="street-address" required />
              <Field label="Gouvernorat" as="select" value={form.city} onChange={set('city')} error={errors.city}>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Field>
              <Field label="Code postal" value={form.postal_code} onChange={set('postal_code')} autoComplete="postal-code" inputMode="numeric" />
            </div>
            <Field label="Instructions de livraison (facultatif)" as="textarea" rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </section>

          <section className="form__block">
            <h2>Paiement</h2>
            <div className="pay">
              <label className={`pay__opt ${payment === 'cod' ? 'is-on' : ''}`}>
                <input type="radio" name="payment" value="cod" checked={payment === 'cod'} onChange={() => setPayment('cod')} />
                <span><b>Paiement à la livraison</b>Vous réglez {money(total)} en espèces au livreur.</span>
              </label>
              <label className={`pay__opt ${payment === 'online' ? 'is-on' : ''}`}>
                <input type="radio" name="payment" value="online" checked={payment === 'online'} onChange={() => setPayment('online')} />
                <span><b>Paiement en ligne</b>Carte bancaire, e-DINAR ou portefeuille Konnect, sur une page sécurisée.</span>
              </label>
            </div>
          </section>

          {!account && (
            <section className="form__block">
              <label className="check">
                <input type="checkbox" checked={createAccount} onChange={(e) => setCreateAccount(e.target.checked)} />
                Créer un compte pour suivre mes commandes
              </label>
              {createAccount && (
                <Field label="Mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  error={errors.create_account_password} hint="8 caractères minimum" autoComplete="new-password" />
              )}
            </section>
          )}
        </div>

        <Summary>
          {message && <p className="alert" role="alert">{message}</p>}
          <button type="submit" className="btn btn--big btn--block" disabled={sending}>
            {sending ? 'Envoi…' : payment === 'online' ? `Payer ${money(total)}` : 'Confirmer la commande'}
          </button>
          <p className="muted small">En commandant, vous acceptez les <Link to="/conditions-generales" className="link">conditions générales de vente</Link>.</p>
        </Summary>
      </form>
    </div>
  );
}
