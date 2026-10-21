import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { adminApi, tokens } from '../lib/api.js';
import { Field } from '../components/ui.jsx';
import Dashboard from './Dashboard.jsx';
import Products from './Products.jsx';
import ProductEdit from './ProductEdit.jsx';
import Categories from './Categories.jsx';
import Orders, { OrderDetail } from './Orders.jsx';
import Quotes, { QuoteDetail } from './Quotes.jsx';
import Customers, { CustomerDetail } from './Customers.jsx';
import Posts, { PostEdit } from './Posts.jsx';
import Settings from './Settings.jsx';
import '../styles/base.css';
import '../styles/admin.css';

export default function AdminApp() {
  const [admin, setAdmin] = useState(undefined); // undefined = vérification en cours

  useEffect(() => {
    document.title = 'Admin · Novalux';
    if (tokens.admin()) adminApi.get('/me').then(setAdmin).catch(() => setAdmin(null));
    else setAdmin(null);
    const onLogout = () => setAdmin(null);
    window.addEventListener('nv:admin-logout', onLogout);
    return () => window.removeEventListener('nv:admin-logout', onLogout);
  }, []);

  if (admin === undefined) return null;
  if (!admin) return <AdminLogin onLogin={setAdmin} />;

  const logout = () => { tokens.setAdmin(null); setAdmin(null); };

  return (
    <div className="adm">
      <aside className="adm__side">
        <Link to="/admin" className="adm__brand">novalux <span>admin</span></Link>
        <nav aria-label="Administration">
          <NavLink to="/admin" end>Tableau de bord</NavLink>
          <NavLink to="/admin/commandes">Commandes</NavLink>
          <NavLink to="/admin/devis">Devis</NavLink>
          <NavLink to="/admin/produits">Produits</NavLink>
          <NavLink to="/admin/gammes">Gammes</NavLink>
          <NavLink to="/admin/clients">Clients</NavLink>
          <NavLink to="/admin/actualites">Actualités</NavLink>
          <NavLink to="/admin/reglages">Réglages</NavLink>
        </nav>
        <div className="adm__user">
          <p>{admin.email}</p>
          <a href="/" target="_blank" rel="noreferrer">Voir la boutique</a>
          <button type="button" className="link" onClick={logout}>Se déconnecter</button>
        </div>
      </aside>
      <main className="adm__main">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="commandes" element={<Orders />} />
          <Route path="commandes/:id" element={<OrderDetail />} />
          <Route path="devis" element={<Quotes />} />
          <Route path="devis/:id" element={<QuoteDetail />} />
          <Route path="produits" element={<Products />} />
          <Route path="produits/nouveau" element={<ProductEdit />} />
          <Route path="produits/:id" element={<ProductEdit />} />
          <Route path="gammes" element={<Categories />} />
          <Route path="clients" element={<Customers />} />
          <Route path="clients/:id" element={<CustomerDetail />} />
          <Route path="actualites" element={<Posts />} />
          <Route path="actualites/nouveau" element={<PostEdit />} />
          <Route path="actualites/:id" element={<PostEdit />} />
          <Route path="reglages" element={<Settings />} />
          <Route path="*" element={<p>Page introuvable. <Link to="/admin" className="link">Retour au tableau de bord</Link></p>} />
        </Routes>
      </main>
    </div>
  );
}

function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await adminApi.post('/login', { email, password });
      tokens.setAdmin(res.token);
      onLogin(res.admin);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="adm-login">
      <form onSubmit={submit} className="adm-login__card">
        <p className="adm__brand">novalux <span>admin</span></p>
        <h1>Connexion</h1>
        <Field label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
        <Field label="Mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <p className="alert" role="alert">{error}</p>}
        <button type="submit" className="btn btn--block" disabled={busy}>Se connecter</button>
      </form>
    </div>
  );
}

/** En-tête de page admin */
export function PageHead({ title, children, back }) {
  return (
    <header className="adm-head">
      <div>
        {back && <Link to={back.to} className="adm-head__back">{back.label}</Link>}
        <h1>{title}</h1>
      </div>
      {children && <div className="row">{children}</div>}
    </header>
  );
}

/** Pagination simple */
export function Pager({ page, size, total, onPage }) {
  const pages = Math.ceil(total / size);
  if (pages <= 1) return null;
  return (
    <div className="adm-pager">
      <button type="button" className="btn btn--ghost btn--small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Précédent</button>
      <span>Page {page} sur {pages}</span>
      <button type="button" className="btn btn--ghost btn--small" disabled={page >= pages} onClick={() => onPage(page + 1)}>Suivant</button>
    </div>
  );
}

/** Onglets de filtre avec compteurs */
export function StatusTabs({ value, onChange, options, counts = {} }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="tabs" role="tablist">
      <button type="button" role="tab" aria-selected={!value} onClick={() => onChange('')}>Toutes <b>{total}</b></button>
      {Object.entries(options).map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}>
          {label} <b>{counts[k] || 0}</b>
        </button>
      ))}
    </div>
  );
}
