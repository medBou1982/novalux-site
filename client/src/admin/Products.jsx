import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { money } from '../lib/format.js';
import { ErrorBox, Loading } from '../components/ui.jsx';
import ProductVisual from '../components/ProductVisual.jsx';
import { PageHead, Pager } from './AdminApp.jsx';

export default function Products() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const page = Number(params.get('page') || 1);
  const qs = new URLSearchParams({ page });
  for (const k of ['q', 'category']) if (params.get(k)) qs.set(k, params.get(k));
  if (params.get('statut')) qs.set('status', params.get('statut'));

  const { data, error, loading, reload } = useFetch(() => adminApi.get(`/products?${qs}`), [qs.toString()]);
  const cats = useFetch(() => adminApi.get('/categories'), []);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, String(v)) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  return (
    <>
      <PageHead title="Produits">
        <Link to="/admin/produits/nouveau" className="btn">Ajouter un produit</Link>
      </PageHead>

      <div className="filters">
        <form onSubmit={(e) => { e.preventDefault(); update({ q }); }}>
          <input type="search" placeholder="Nom ou référence" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un produit" />
        </form>
        <select value={params.get('category') || ''} onChange={(e) => update({ category: e.target.value })} aria-label="Gamme">
          <option value="">Toutes les gammes</option>
          {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? '— ' : ''}{c.name}</option>)}
        </select>
        <select value={params.get('statut') || ''} onChange={(e) => update({ statut: e.target.value })} aria-label="Statut">
          <option value="">Tous les statuts</option>
          <option value="actif">En ligne</option>
          <option value="masque">Masqués</option>
          <option value="devis">Sur devis</option>
        </select>
      </div>

      {loading && !data && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <div className="card card--flush">
          {data.items.length === 0 ? <p className="empty-row">Aucun produit ne correspond à ces filtres.</p> : (
            <table className="table">
              <thead>
                <tr><th aria-label="Visuel" /><th>Produit</th><th>Gamme</th><th className="num">Prix</th><th className="num">Stock</th><th>Statut</th></tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td className="thumb-cell"><ProductVisual image={p.image_url} color={p.color_hex} name="" quoteOnly={p.quote_only} /></td>
                    <td>
                      <Link to={`/admin/produits/${p.id}`} className="link">{p.name}</Link>
                      <small className="sub">{p.variant_count} variante{p.variant_count > 1 ? 's' : ''}</small>
                    </td>
                    <td>{p.category_name || <span className="muted">Sans gamme</span>}</td>
                    <td className="num">
                      {p.quote_only ? 'Sur devis' : p.min_price == null ? '—' : p.min_price === p.max_price ? money(p.min_price) : `${money(p.min_price)} – ${money(p.max_price)}`}
                    </td>
                    <td className="num">
                      {p.quote_only ? '—' : p.stock_total}
                      {p.low_count > 0 && <small className="sub text-warn">{p.low_count} en stock faible</small>}
                    </td>
                    <td>
                      <span className={`badge ${p.is_active ? 'badge--livree' : ''}`}>{p.is_active ? 'En ligne' : 'Masqué'}</span>
                      {p.is_new && <span className="badge badge--nouvelle">Nouveau</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pager page={data.page} size={data.size} total={data.total} onPage={(n) => update({ page: n })} />
        </div>
      )}
    </>
  );
}
