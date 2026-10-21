import { useState } from 'react';
import { adminApi } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { toDinars, toMillimes } from '../lib/format.js';
import { ErrorBox, Field, Loading } from '../components/ui.jsx';
import { PageHead } from './AdminApp.jsx';

export default function Settings() {
  const { data, error, loading } = useFetch(() => adminApi.get('/settings'), []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <PageHead title="Réglages" />
      <div className="cols cols--edit">
        <SettingsForm initial={data} />
        <PasswordForm />
      </div>
    </>
  );
}

function SettingsForm({ initial }) {
  const [ship, setShip] = useState({ flat_fee: toDinars(initial.shipping.flat_fee), free_threshold: toDinars(initial.shipping.free_threshold) });
  const [contact, setContact] = useState(initial.contact);
  const [message, setMessage] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    try {
      await adminApi.put('/settings', {
        shipping: { flat_fee: toMillimes(ship.flat_fee), free_threshold: toMillimes(ship.free_threshold) },
        contact,
      });
      setMessage({ ok: true, text: 'Réglages enregistrés.' });
    } catch (err) { setMessage({ ok: false, text: err.message }); }
  };
  const c = (k) => (e) => setContact((x) => ({ ...x, [k]: e.target.value }));

  return (
    <form className="card" onSubmit={save}>
      <h2>Livraison</h2>
      <div className="form__grid">
        <Field label="Frais de port (DT)" inputMode="decimal" value={ship.flat_fee} onChange={(e) => setShip((s) => ({ ...s, flat_fee: e.target.value }))} />
        <Field label="Offerts à partir de (DT)" inputMode="decimal" value={ship.free_threshold} onChange={(e) => setShip((s) => ({ ...s, free_threshold: e.target.value }))} hint="0 = jamais offerts" />
      </div>
      <h2>Coordonnées affichées sur le site</h2>
      <Field label="Téléphone" value={contact.phone} onChange={c('phone')} />
      <Field label="E-mail" type="email" value={contact.email} onChange={c('email')} />
      <Field label="Adresse" value={contact.address} onChange={c('address')} />
      <Field label="Page Facebook" value={contact.facebook} onChange={c('facebook')} />
      {message && <p className={message.ok ? 'notice' : 'alert'} role="status">{message.text}</p>}
      <button type="submit" className="btn">Enregistrer</button>
    </form>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    try {
      await adminApi.put('/me/password', { current, next });
      setCurrent(''); setNext('');
      setMessage({ ok: true, text: 'Mot de passe modifié.' });
    } catch (err) { setMessage({ ok: false, text: err.message }); }
  };
  return (
    <form className="card" onSubmit={save}>
      <h2>Mon mot de passe</h2>
      <Field label="Mot de passe actuel" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      <Field label="Nouveau mot de passe" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" hint="8 caractères minimum" />
      {message && <p className={message.ok ? 'notice' : 'alert'} role="status">{message.text}</p>}
      <button type="submit" className="btn">Changer le mot de passe</button>
      <p className="muted small">Pour ajouter un autre administrateur : <code>npm run admin:create -- email motdepasse "Nom"</code> sur le serveur.</p>
    </form>
  );
}
