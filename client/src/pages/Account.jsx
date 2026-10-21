import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { ORDER_STATUS, QUOTE_STATUS, date, money } from '../lib/format.js';
import { Field } from '../components/ui.jsx';

export function Login() {
  const { login, account } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const back = params.get('retour') || '/compte';

  if (account) return <Navigate to={back} replace />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage('');
    try {
      const res = mode === 'login'
        ? await api.post('/account/login', { email: form.email, password: form.password })
        : await api.post('/account/register', form);
      await login(res.token);
      navigate(back, { replace: true });
    } catch (err) {
      setErrors(err.details || {});
      setMessage(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="wrap section narrow">
      <header className="page-head">
        <h1>{mode === 'login' ? 'Se connecter' : 'Créer un compte'}</h1>
        <p>Un compte permet de suivre vos commandes et devis. Il n’est pas obligatoire pour commander.</p>
      </header>
      <form className="form form--small" onSubmit={submit} noValidate>
        {mode === 'register' && (
          <div className="form__grid">
            <Field label="Prénom" value={form.first_name} onChange={set('first_name')} error={errors.first_name} autoComplete="given-name" />
            <Field label="Nom" value={form.last_name} onChange={set('last_name')} error={errors.last_name} autoComplete="family-name" />
          </div>
        )}
        <Field label="E-mail" type="email" value={form.email} onChange={set('email')} error={errors.email} autoComplete="email" />
        <Field label="Mot de passe" type="password" value={form.password} onChange={set('password')} error={errors.password}
          hint={mode === 'register' ? '8 caractères minimum' : undefined} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        {message && <p className="alert" role="alert">{message}</p>}
        <button type="submit" className="btn btn--big btn--block" disabled={busy}>{mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
        <p className="muted">
          {mode === 'login' ? 'Pas encore de compte ? ' : 'Déjà inscrit ? '}
          <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage(''); setErrors({}); }}>
            {mode === 'login' ? 'Créer un compte' : 'Se connecter'}
          </button>
        </p>
      </form>
    </div>
  );
}

export default function Account() {
  const { account, logout, refreshAccount } = useStore();
  const [edit, setEdit] = useState(false);

  if (!account) return <Navigate to="/connexion" replace />;

  return (
    <div className="wrap section">
      <header className="page-head row row--between">
        <div>
          <h1>Bonjour {account.first_name}</h1>
          <p>{account.email}</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={logout}>Se déconnecter</button>
      </header>

      <div className="account">
        <section>
          <h2>Mes commandes</h2>
          {account.orders.length === 0 ? <p className="muted">Aucune commande pour l’instant.</p> : (
            <table className="table">
              <thead><tr><th>N°</th><th>Date</th><th>Statut</th><th className="num">Total</th></tr></thead>
              <tbody>
                {account.orders.map((o) => (
                  <tr key={o.number}>
                    <td><Link to={`/commande/${o.number}`} className="link">{o.number}</Link></td>
                    <td>{date(o.created_at)}</td>
                    <td><span className={`badge badge--${o.status}`}>{ORDER_STATUS[o.status]}</span></td>
                    <td className="num">{money(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {account.quotes.length > 0 && (
            <>
              <h2>Mes demandes de devis</h2>
              <table className="table">
                <thead><tr><th>N°</th><th>Date</th><th>Statut</th></tr></thead>
                <tbody>
                  {account.quotes.map((q) => (
                    <tr key={q.number}><td>{q.number}</td><td>{date(q.created_at)}</td><td>{QUOTE_STATUS[q.status]}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <section>
          <h2>Mes coordonnées</h2>
          {edit ? <ProfileForm account={account} onDone={async () => { await refreshAccount(); setEdit(false); }} /> : (
            <>
              <p>{account.first_name} {account.last_name}{account.company && <><br />{account.company}</>}<br />
                {account.phone || 'Téléphone non renseigné'}<br />
                {account.address ? `${account.address}, ${account.postal_code} ${account.city}` : 'Adresse non renseignée'}</p>
              <button type="button" className="btn btn--ghost" onClick={() => setEdit(true)}>Modifier</button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function ProfileForm({ account, onDone }) {
  const keys = ['first_name', 'last_name', 'company', 'phone', 'address', 'city', 'postal_code'];
  const [form, setForm] = useState(Object.fromEntries(keys.map((k) => [k, account[k] || ''])));
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    try { await api.put('/account/me', form); onDone(); } catch (err) { setErrors(err.details || { first_name: err.message }); }
  };
  return (
    <form className="form" onSubmit={save} noValidate>
      <div className="form__grid">
        <Field label="Prénom" value={form.first_name} onChange={set('first_name')} error={errors.first_name} />
        <Field label="Nom" value={form.last_name} onChange={set('last_name')} error={errors.last_name} />
        <Field label="Société" value={form.company} onChange={set('company')} />
        <Field label="Téléphone" value={form.phone} onChange={set('phone')} />
        <Field label="Adresse" className="span-2" value={form.address} onChange={set('address')} />
        <Field label="Ville" value={form.city} onChange={set('city')} />
        <Field label="Code postal" value={form.postal_code} onChange={set('postal_code')} />
      </div>
      <button type="submit" className="btn">Enregistrer</button>
    </form>
  );
}
