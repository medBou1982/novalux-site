import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import ProductCard from '../components/ProductCard.jsx';
import { ErrorBox, Loading } from '../components/ui.jsx';

/** Liste de produits : une gamme (/gamme/:slug), les nouveautés ou une recherche. */
export default function Catalog({ mode = 'category' }) {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const sort = params.get('tri') || '';
  const page = Number(params.get('page') || 1);
  const q = params.get('q') || '';

  const category = useFetch(() => (mode === 'category' ? api.get(`/categories/${slug}`) : Promise.resolve(null)), [mode, slug]);

  const qs = new URLSearchParams({ page, size: 24 });
  if (sort) qs.set('tri', sort);
  if (mode === 'category') qs.set('category', slug);
  if (mode === 'new') qs.set('new', '1');
  if (mode === 'search') qs.set('q', q);
  const products = useFetch(() => api.get(`/products?${qs}`), [qs.toString()]);

  const title = mode === 'new' ? 'Nouveautés' : mode === 'search' ? `Résultats pour « ${q} »` : category.data?.name;
  const cat = category.data;
  const pages = products.data ? Math.ceil(products.data.total / products.data.size) : 1;

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next);
  };

  if (category.error) return <div className="wrap section"><ErrorBox error={category.error} /></div>;

  return (
    <div className="wrap section">
      {cat?.parent && (
        <nav className="crumbs" aria-label="Fil d’Ariane">
          <Link to="/">Accueil</Link> / <Link to={`/gamme/${cat.parent.slug}`}>{cat.parent.name}</Link>
        </nav>
      )}
      <header className="page-head">
        <h1>{title || '…'}</h1>
        {cat?.description && <p>{cat.description}</p>}
      </header>

      {cat?.children?.length > 0 && (
        <ul className="chips-nav">
          {cat.children.map((c) => <li key={c.id}><Link to={`/gamme/${c.slug}`}>{c.name}</Link></li>)}
        </ul>
      )}

      <div className="toolbar">
        <p>{products.data ? `${products.data.total} produit${products.data.total > 1 ? 's' : ''}` : ''}</p>
        <label className="sort">
          Trier par
          <select value={sort} onChange={(e) => update({ tri: e.target.value, page: '' })}>
            <option value="">Pertinence</option>
            <option value="prix_asc">Prix croissant</option>
            <option value="prix_desc">Prix décroissant</option>
            <option value="recent">Les plus récents</option>
            <option value="nom">Nom</option>
          </select>
        </label>
      </div>

      {products.loading && !products.data && <Loading />}
      <ErrorBox error={products.error} onRetry={products.reload} />
      {products.data?.items.length === 0 && (
        <div className="empty">
          <p>Aucun produit ne correspond{mode === 'search' ? ' à cette recherche' : ' pour l’instant'}.</p>
          <Link to="/devis" className="btn">Décrire votre besoin</Link>
        </div>
      )}
      <div className="grid">
        {products.data?.items.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>

      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" aria-current={n === page ? 'page' : undefined} onClick={() => update({ page: n > 1 ? String(n) : '' })}>{n}</button>
          ))}
        </nav>
      )}
    </div>
  );
}
