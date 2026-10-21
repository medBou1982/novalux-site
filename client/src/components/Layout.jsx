import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { useFetch } from '../lib/useFetch.js';
import { api } from '../lib/api.js';

function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Novalux, accueil">
      <span className="logo__bars" aria-hidden="true"><i /><i /><i /></span>
      <span className="logo__word">novalux</span>
    </Link>
  );
}

export default function Layout() {
  const { cartCount, quote, account, toast } = useStore();
  const { data: categories } = useFetch(() => api.get('/categories'), []);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [location.pathname]);

  const top = (categories || []).filter((c) => !c.parent_id);
  const search = (e) => {
    e.preventDefault();
    if (q.trim()) navigate(`/recherche?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="shop">
      <a href="#contenu" className="skip">Aller au contenu</a>
      <header className="header">
        <div className="header__row wrap">
          <Logo />
          <form className="search" onSubmit={search} role="search">
            <input type="search" placeholder="Rechercher une couleur, une référence…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
          </form>
          <nav className="header__tools" aria-label="Mon espace">
            <Link to={account ? '/compte' : '/connexion'}>{account ? account.first_name || 'Mon compte' : 'Se connecter'}</Link>
            {quote.length > 0 && <Link to="/devis">Devis <b className="count">{quote.length}</b></Link>}
            <Link to="/panier" className="cart-link">Panier <b className="count">{cartCount}</b></Link>
          </nav>
          <button type="button" className="burger" aria-expanded={open} aria-controls="menu" onClick={() => setOpen((o) => !o)}>
            Menu
          </button>
        </div>
        <nav id="menu" className={`menu ${open ? 'menu--open' : ''}`} aria-label="Navigation principale">
          <div className="wrap menu__row">
            {top.map((c) => <NavLink key={c.id} to={`/gamme/${c.slug}`}>{c.name}</NavLink>)}
            <NavLink to="/nouveautes">Nouveautés</NavLink>
            <NavLink to="/actualites">Actualités</NavLink>
            <NavLink to="/a-propos">À propos</NavLink>
            <NavLink to="/contact">Contact</NavLink>
          </div>
        </nav>
      </header>

      <main id="contenu">
        <Outlet />
      </main>

      <Footer />
      {toast && <div className="toast" role="status" key={toast.id}>{toast.message}</div>}
    </div>
  );
}

function Footer() {
  const { settings } = useStore();
  const c = settings.contact || {};
  return (
    <footer className="footer">
      <div className="wrap footer__grid">
        <div>
          <Logo />
          <p className="footer__lead">Peintures beaux-arts et colorants industriels fabriqués à Sfax.</p>
        </div>
        <div>
          <h2>Boutique</h2>
          <ul>
            <li><Link to="/gamme/beaux-arts">Beaux-arts</Link></li>
            <li><Link to="/gamme/gamme-industrielle">Gamme industrielle</Link></li>
            <li><Link to="/devis">Demander un devis</Link></li>
            <li><Link to="/conditions-generales">Conditions générales de vente</Link></li>
          </ul>
        </div>
        <div>
          <h2>Nous contacter</h2>
          <ul>
            {c.phone && <li><a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a></li>}
            {c.email && <li><a href={`mailto:${c.email}`}>{c.email}</a></li>}
            {c.address && <li>{c.address}</li>}
            {c.facebook && <li><a href={c.facebook} target="_blank" rel="noreferrer">Facebook</a></li>}
          </ul>
        </div>
      </div>
      <p className="wrap footer__legal">© {new Date().getFullYear()} Novalux. Tous droits réservés.</p>
    </footer>
  );
}
