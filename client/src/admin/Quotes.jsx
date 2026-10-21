import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { adminApi } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { QUOTE_STATUS, dateTime } from '../lib/format.js';
import { ErrorBox, Field, Loading } from '../components/ui.jsx';
import { PageHead, Pager, StatusTabs } from './AdminApp.jsx';

export default function Quotes() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const qs = new URLSearchParams({ page: params.get('page') || 1 });
  if (params.get('statut')) qs.set('status', params.get('statut'));
  if (params.get('q')) qs.set('q', params.get('q'));
  const { data, error, loading, reload } = useFetch(() => adminApi.get(`/quotes?${qs}`), [qs.toString()]);
  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, String(v)) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  return (
    <>
      <PageHead title="Demandes de devis et messages" />
      <StatusTabs value={params.get('statut') || ''} onChange={(v) => update({ statut: v })} options={QUOTE_STATUS} counts={data?.counts} />
      <div className="filters">
        <form onSubmit={(e) => { e.preventDefault(); update({ q }); }}>
          <input type="search" placeholder="N°, société, nom ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        </form>
      </div>
      {loading && !data && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <div className="card card--flush">
          {data.items.length === 0 ? <p className="empty-row">Aucune demande ne correspond.</p> : (
            <table className="table">
              <thead><tr><th>Demande</th><th>Contact</th><th>Contenu</th><th>Statut</th></tr></thead>
              <tbody>
                {data.items.map((x) => (
                  <tr key={x.id}>
                    <td><Link to={`/admin/devis/${x.id}`} className="link">{x.number}</Link><small className="sub">{dateTime(x.created_at)}</small></td>
                    <td>{x.company || `${x.first_name} ${x.last_name}`}<small className="sub">{x.company ? `${x.first_name} ${x.last_name} · ` : ''}{x.phone}</small></td>
                    <td>{x.item_count ? `${x.item_count} produit${x.item_count > 1 ? 's' : ''}` : 'Message'}<small className="sub clip">{x.message}</small></td>
                    <td><span className={`badge badge--${x.status}`}>{QUOTE_STATUS[x.status]}</span></td>
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

export function QuoteDetail() {
  const { id } = useParams();
  const { data: qt, error, loading, setData } = useFetch(() => adminApi.get(`/quotes/${id}`), [id]);
  const [notes, setNotes] = useState(null);
  const [saved, setSaved] = useState('');

  if (loading && !qt) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const currentNotes = notes ?? qt.admin_notes;

  const save = async (patch) => {
    const updated = await adminApi.patch(`/quotes/${qt.id}`, patch);
    setData((d) => ({ ...d, ...updated }));
    setSaved('Enregistré.');
    setTimeout(() => setSaved(''), 2500);
  };

  const subject = encodeURIComponent(`Votre demande de devis ${qt.number} – Novalux`);

  return (
    <>
      <PageHead title={`Demande ${qt.number}`} back={{ to: '/admin/devis', label: 'Devis' }}>
        <a className="btn btn--ghost" href={`mailto:${qt.email}?subject=${subject}`}>Répondre par e-mail</a>
      </PageHead>
      <div className="cols cols--edit">
        <section className="card">
          <h2>Produits demandés</h2>
          {qt.items.length === 0 ? <p className="muted">Aucun produit : message libre.</p> : (
            <table className="table">
              <thead><tr><th>Produit</th><th>Quantité</th></tr></thead>
              <tbody>
                {qt.items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.product_name}<small className="sub">{it.variant_label}</small></td>
                    <td>{it.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {qt.message && <><h2>Message</h2><p className="note">{qt.message}</p></>}
        </section>

        <div className="stack">
          <section className="card">
            <h2>Contact</h2>
            <p>
              {qt.company && <><b>{qt.company}</b><br /></>}
              {qt.first_name} {qt.last_name}<br />
              <a href={`tel:${qt.phone.replace(/\s/g, '')}`} className="link">{qt.phone}</a><br />
              <a href={`mailto:${qt.email}`} className="link">{qt.email}</a>
              {qt.city && <><br />{qt.city}</>}
            </p>
            <p className="muted small">Reçue le {dateTime(qt.created_at)}</p>
          </section>
          <section className="card">
            <h2>Suivi</h2>
            <Field label="Statut" as="select" value={qt.status} onChange={(e) => save({ status: e.target.value })}>
              {Object.entries(QUOTE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Field>
            <Field label="Notes internes" as="textarea" rows="5" value={currentNotes} onChange={(e) => setNotes(e.target.value)} hint="Visibles uniquement dans l’admin." />
            <div className="row">
              <button type="button" className="btn btn--small" onClick={() => save({ admin_notes: currentNotes })}>Enregistrer les notes</button>
              {saved && <span className="text-ok" role="status">{saved}</span>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
