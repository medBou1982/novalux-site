import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { adminApi } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, dateTime, money } from '../lib/format.js';
import { ErrorBox, Loading, Swatch } from '../components/ui.jsx';
import { PageHead, Pager, StatusTabs } from './AdminApp.jsx';

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const qs = new URLSearchParams({ page: params.get('page') || 1 });
  if (params.get('statut')) qs.set('status', params.get('statut'));
  if (params.get('q')) qs.set('q', params.get('q'));
  if (params.get('paiement')) qs.set('payment', params.get('paiement'));
  const { data, error, loading, reload } = useFetch(() => adminApi.get(`/orders?${qs}`), [qs.toString()]);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, String(v)) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  return (
    <>
      <PageHead title="Commandes" />
      <StatusTabs value={params.get('statut') || ''} onChange={(v) => update({ statut: v })} options={ORDER_STATUS} counts={data?.counts} />
      <div className="filters">
        <form onSubmit={(e) => { e.preventDefault(); update({ q }); }}>
          <input type="search" placeholder="N°, nom, e-mail ou téléphone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher une commande" />
        </form>
        <select value={params.get('paiement') || ''} onChange={(e) => update({ paiement: e.target.value })} aria-label="Mode de paiement">
          <option value="">Tous les paiements</option>
          <option value="cod">À la livraison</option>
          <option value="online">En ligne</option>
        </select>
      </div>

      {loading && !data && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <div className="card card--flush">
          {data.items.length === 0 ? <p className="empty-row">Aucune commande ne correspond à ces filtres.</p> : (
            <table className="table">
              <thead><tr><th>Commande</th><th>Client</th><th>Paiement</th><th>Statut</th><th className="num">Total</th></tr></thead>
              <tbody>
                {data.items.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/admin/commandes/${o.id}`} className="link">{o.number}</Link><small className="sub">{dateTime(o.created_at)}</small></td>
                    <td>{o.first_name} {o.last_name}<small className="sub">{o.city} · {o.phone}</small></td>
                    <td>{PAYMENT_METHOD[o.payment_method]}<small className="sub"><span className={`badge badge--${o.payment_status}`}>{PAYMENT_STATUS[o.payment_status]}</span></small></td>
                    <td><span className={`badge badge--${o.status}`}>{ORDER_STATUS[o.status]}</span></td>
                    <td className="num">{money(o.total)}<small className="sub">{o.item_count} article{o.item_count > 1 ? 's' : ''}</small></td>
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

// Étape suivante proposée selon le statut actuel
const NEXT = {
  nouvelle: { status: 'confirmee', label: 'Confirmer la commande' },
  confirmee: { status: 'expediee', label: 'Marquer comme expédiée' },
  expediee: { status: 'livree', label: 'Marquer comme livrée' },
};

export function OrderDetail() {
  const { id } = useParams();
  const { data: o, error, loading, setData } = useFetch(() => adminApi.get(`/orders/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (loading && !o) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const patch = async (body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setActionError(null);
    try { setData(await adminApi.patch(`/orders/${o.id}`, body)); } catch (err) { setActionError(err); } finally { setBusy(false); }
  };
  const next = NEXT[o.status];
  const isCod = o.payment_method === 'cod';

  return (
    <>
      <PageHead title={`Commande ${o.number}`} back={{ to: '/admin/commandes', label: 'Commandes' }}>
        <button type="button" className="btn btn--ghost" onClick={() => window.print()}>Imprimer</button>
        {next && <button type="button" className="btn" disabled={busy} onClick={() => patch({ status: next.status, ...(next.status === 'livree' && isCod ? { payment_status: 'paid' } : {}) })}>{next.label}</button>}
      </PageHead>
      <ErrorBox error={actionError} />

      <div className="cols cols--edit">
        <section className="card">
          <div className="card__head">
            <h2>Articles</h2>
            <span className={`badge badge--${o.status}`}>{ORDER_STATUS[o.status]}</span>
          </div>
          <table className="table">
            <thead><tr><th>Produit</th><th>Réf.</th><th className="num">Qté</th><th className="num">Prix</th><th className="num">Total</th></tr></thead>
            <tbody>
              {o.items.map((it) => (
                <tr key={it.id}>
                  <td><Swatch hex={it.color_hex} size={12} /> {it.product_name}<small className="sub">{it.variant_label}</small></td>
                  <td>{it.sku}</td>
                  <td className="num">{it.quantity}</td>
                  <td className="num">{money(it.unit_price)}</td>
                  <td className="num">{money(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan="4">Sous-total</td><td className="num">{money(o.subtotal)}</td></tr>
              <tr><td colSpan="4">Livraison</td><td className="num">{o.shipping ? money(o.shipping) : 'Offerte'}</td></tr>
              <tr className="total"><td colSpan="4">Total</td><td className="num">{money(o.total)}</td></tr>
            </tfoot>
          </table>
          {o.notes && <p className="note"><b>Note du client :</b> {o.notes}</p>}
        </section>

        <div className="stack">
          <section className="card">
            <h2>Client</h2>
            <p>
              <b>{o.first_name} {o.last_name}</b><br />
              <a href={`tel:${o.phone.replace(/\s/g, '')}`} className="link">{o.phone}</a><br />
              <a href={`mailto:${o.email}`} className="link">{o.email}</a>
            </p>
            <p>{o.address}<br />{o.postal_code} {o.city}</p>
            {o.customer_id && <Link to={`/admin/clients/${o.customer_id}`} className="link">Fiche client</Link>}
          </section>

          <section className="card">
            <h2>Paiement</h2>
            <p>{PAYMENT_METHOD[o.payment_method]} · <span className={`badge badge--${o.payment_status}`}>{PAYMENT_STATUS[o.payment_status]}</span></p>
            {o.payment_ref && <p className="muted small">Réf. paiement : {o.payment_ref}</p>}
            {o.payment_status !== 'paid' && o.status !== 'annulee' && (
              <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => patch({ payment_status: 'paid' })}>Marquer comme payée</button>
            )}
            {o.payment_status === 'paid' && o.status === 'annulee' && (
              <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => patch({ payment_status: 'refunded' })}>Marquer comme remboursée</button>
            )}
          </section>

          <section className="card">
            <h2>Historique</h2>
            <p className="muted small">Créée le {dateTime(o.created_at)}<br />Dernière mise à jour le {dateTime(o.updated_at)}</p>
            {o.status !== 'annulee' && o.status !== 'livree' && (
              <button type="button" className="link link--danger" disabled={busy}
                onClick={() => patch({ status: 'annulee' }, `Annuler la commande ${o.number} ? Les articles seront remis en stock.`)}>
                Annuler la commande
              </button>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
