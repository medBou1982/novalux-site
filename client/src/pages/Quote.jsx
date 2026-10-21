import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { Field } from '../components/ui.jsx';

/** Demande de devis : produits ajoutés depuis les fiches + message libre. Sert aussi de formulaire de contact. */
export default function Quote({ contactMode = false, aside = null }) {
  const { quote, updateQuoteLine, removeFromQuote, clearQuote, account } = useStore();
  const [form, setForm] = useState({
    company: account?.company || '', first_name: account?.first_name || '', last_name: account?.last_name || '',
    email: account?.email || '', phone: account?.phone || '', city: account?.city || '', message: '',
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(null);
  const [sending, setSending] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const items = contactMode ? [] : quote;

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setErrors({});
    setMessage('');
    try {
      const res = await api.post('/quotes', {
        ...form,
        items: items.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity || '1' })),
      });
      if (!contactMode) clearQuote();
      setSent(res.number);
    } catch (err) {
      setErrors(err.details || {});
      setMessage(err.message);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="wrap section narrow">
        <header className="page-head">
          <h1>{contactMode ? 'Message envoyé' : `Demande ${sent} envoyée`}</h1>
          <p>Notre équipe vous répond sous 48 heures ouvrées à {form.email}.</p>
        </header>
        <Link to="/" className="btn">Retour à la boutique</Link>
      </div>
    );
  }

  return (
    <div className="wrap section narrow">
      <header className="page-head">
        <h1>{contactMode ? 'Écrivez-nous' : 'Demande de devis'}</h1>
        <p>{contactMode
          ? 'Une question sur un produit, une commande ou un partenariat ? Nous répondons sous 48 heures ouvrées.'
          : 'Pour la gamme industrielle, les teintes sur mesure et les gros volumes. Nous vous envoyons une offre chiffrée.'}</p>
      </header>
      {aside}

      <form onSubmit={submit} noValidate className="form">
        {!contactMode && (
          <section className="form__block">
            <h2>Produits</h2>
            {items.length === 0 ? (
              <p className="muted">Aucun produit ajouté. Ajoutez-en depuis une fiche produit, par exemple dans la <Link to="/gamme/gamme-industrielle" className="link">gamme industrielle</Link>, ou décrivez votre besoin ci-dessous.</p>
            ) : (
              <ul className="qlines">
                {items.map((l, i) => (
                  <li key={`${l.product_id}-${l.variant_id || 0}`}>
                    <div>
                      <Link to={`/produit/${l.product_slug}`} className="line__name">{l.product_name}</Link>
                      {l.label && <p className="line__meta">{l.label}</p>}
                    </div>
                    <input aria-label={`Quantité pour ${l.product_name}`} value={l.quantity} placeholder="Quantité (ex. 200 kg)"
                      onChange={(e) => updateQuoteLine(i, { quantity: e.target.value })} />
                    <button type="button" className="link link--danger" onClick={() => removeFromQuote(i)}>Retirer</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="form__block">
          <h2>Vos coordonnées</h2>
          <div className="form__grid">
            <Field label="Société (facultatif)" className="span-2" value={form.company} onChange={set('company')} autoComplete="organization" />
            <Field label="Prénom" value={form.first_name} onChange={set('first_name')} error={errors.first_name} autoComplete="given-name" />
            <Field label="Nom" value={form.last_name} onChange={set('last_name')} error={errors.last_name} autoComplete="family-name" />
            <Field label="E-mail" type="email" value={form.email} onChange={set('email')} error={errors.email} autoComplete="email" />
            <Field label="Téléphone" type="tel" value={form.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" />
            <Field label="Ville" value={form.city} onChange={set('city')} autoComplete="address-level2" />
          </div>
          <Field label={contactMode ? 'Message' : 'Précisions (teintes, support, délais…)'} as="textarea" rows="5"
            value={form.message} onChange={set('message')} error={errors.message} />
        </section>

        {message && <p className="alert" role="alert">{message}</p>}
        <button type="submit" className="btn btn--big" disabled={sending}>{sending ? 'Envoi…' : contactMode ? 'Envoyer le message' : 'Envoyer la demande'}</button>
      </form>
    </div>
  );
}
