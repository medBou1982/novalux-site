import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { adminApi } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { ORDER_STATUS, QUOTE_STATUS, date, dateTime, money } from '../lib/format.js';
import { ErrorBox, Loading } from '../components/ui.jsx';
import { PageHead, Pager } from './AdminApp.jsx';

export default function Customers() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const qs = new URLSearchParams({ page: params.get('page') || 1 });
  if (params.get('q')) qs.set('q', params.get('q'));
  const { data, error, loading, reload } = useFetch(() => adminApi.get(`/customers?${qs}`), [qs.toString()]);

  return (
    <>
      <PageHead title="Clients" />
      <div className="filters">
        <form onSubmit={(e) => { e.preventDefault(); setParams(q ? { q } : {}); }}>
          <input type="search" placeholder="Nom, e-mail, téléphone ou société" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un client" />
        </form>
      </div>
      {loading && !data && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <div className="card card--flush">
          {data.items.length === 0 ? <p className="empty-row">Aucun client trouvé.</p> : (
            <table className="table">
              <thead><tr><th>Client</th><th>Contact</th><th className="num">Commandes</th><th className="num">Total dépensé</th><th>Dernière commande</th></tr></thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/admin/clients/${c.id}`} className="link">{c.first_name} {c.last_name}</Link>
                      <small className="sub">{c.company || (c.has_account ? 'Compte client' : 'Invité')}</small></td>
                    <td>{c.email}<small className="sub">{c.phone} {c.city && `· ${c.city}`}</small></td>
                    <td className="num">{c.order_count}</td>
                    <td className="num">{money(c.total_spent)}</td>
                    <td>{c.last_order_at ? date(c.last_order_at) : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pager page={data.page} size={data.size} total={data.total} onPage={(n) => setParams({ ...(params.get('q') ? { q: params.get('q') } : {}), page: n })} />
        </div>
      )}
    </>
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const { data: c, error, loading } = useFetch(() => adminApi.get(`/customers/${id}`), [id]);
  if (loading && !c) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const spent = c.orders.filter((o) => !['annulee', 'en_attente_paiement'].includes(o.status)).reduce((s, o) => s + o.total, 0);

  return (
    <>
      <PageHead title={`${c.first_name} ${c.last_name}`} back={{ to: '/admin/clients', label: 'Clients' }}>
        <a className="btn btn--ghost" href={`mailto:${c.email}`}>Écrire</a>
      </PageHead>
      <div className="cols cols--edit">
        <div className="stack">
          <section className="card card--flush">
            <h2 className="pad">Commandes <small className="muted">({c.orders.length} · {money(spent)})</small></h2>
            {c.orders.length === 0 ? <p className="empty-row">Aucune commande.</p> : (
              <table className="table">
                <tbody>
                  {c.orders.map((o) => (
                    <tr key={o.id}>
                      <td><Link to={`/admin/commandes/${o.id}`} className="link">{o.number}</Link></td>
                      <td>{dateTime(o.created_at)}</td>
                      <td><span className={`badge badge--${o.status}`}>{ORDER_STATUS[o.status]}</span></td>
                      <td className="num">{money(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          {c.quotes.length > 0 && (
            <section className="card card--flush">
              <h2 className="pad">Demandes de devis</h2>
              <table className="table">
                <tbody>
                  {c.quotes.map((q) => (
                    <tr key={q.id}>
                      <td><Link to={`/admin/devis/${q.id}`} className="link">{q.number}</Link></td>
                      <td>{dateTime(q.created_at)}</td>
                      <td><span className={`badge badge--${q.status}`}>{QUOTE_STATUS[q.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
        <section className="card">
          <h2>Coordonnées</h2>
          <p>
            {c.company && <><b>{c.company}</b><br /></>}
            <a href={`mailto:${c.email}`} className="link">{c.email}</a><br />
            {c.phone && <><a href={`tel:${c.phone.replace(/\s/g, '')}`} className="link">{c.phone}</a><br /></>}
            {c.address && <>{c.address}<br />{c.postal_code} {c.city}</>}
          </p>
          <p className="muted small">{c.has_account ? 'Compte client' : 'Client invité (sans compte)'} depuis le {date(c.created_at)}</p>
        </section>
      </div>
    </>
  );
}
