import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { ErrorBox, Field, Loading } from '../components/ui.jsx';
import { PageHead } from './AdminApp.jsx';

const BLANK = { name: '', slug: '', description: '', parent_id: '', position: 0, image_url: '' };

export default function Categories() {
  const { data, error, loading, reload } = useFetch(() => adminApi.get('/categories'), []);
  const [editing, setEditing] = useState(null);

  if (loading && !data) return <Loading />;
  const tops = (data || []).filter((c) => !c.parent_id);
  const childrenOf = (id) => data.filter((c) => c.parent_id === id);

  return (
    <>
      <PageHead title="Gammes">
        <button type="button" className="btn" onClick={() => setEditing(BLANK)}>Ajouter une gamme</button>
      </PageHead>
      <ErrorBox error={error} onRetry={reload} />
      <div className="cols cols--edit">
        <section className="card card--flush">
          <table className="table">
            <thead><tr><th>Gamme</th><th className="num">Produits</th><th>Ordre</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {tops.map((c) => [c, ...childrenOf(c.id)].map((x) => (
                <tr key={x.id} className={editing?.id === x.id ? 'is-selected' : ''}>
                  <td className={x.parent_id ? 'indent' : ''}><b>{x.name}</b><small className="sub">/gamme/{x.slug}</small></td>
                  <td className="num"><Link to={`/admin/produits?category=${x.id}`} className="link">{x.product_count}</Link></td>
                  <td>{x.position}</td>
                  <td className="num"><button type="button" className="link" onClick={() => setEditing({ ...x, parent_id: x.parent_id || '' })}>Modifier</button></td>
                </tr>
              )))}
            </tbody>
          </table>
        </section>
        {editing && <CategoryForm key={editing.id || 'new'} initial={editing} all={data} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />}
      </div>
    </>
  );
}

function CategoryForm({ initial, all, onDone, onCancel }) {
  const [c, setC] = useState(initial);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const set = (k) => (e) => setC((x) => ({ ...x, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    try {
      const body = { ...c, parent_id: c.parent_id || null };
      if (c.id) await adminApi.put(`/categories/${c.id}`, body); else await adminApi.post('/categories', body);
      onDone();
    } catch (err) { setErrors(err.details || {}); setMessage(err.message); }
  };
  const remove = async () => {
    if (!window.confirm(`Supprimer la gamme « ${c.name} » ?`)) return;
    try { await adminApi.del(`/categories/${c.id}`); onDone(); } catch (err) { setMessage(err.message); }
  };

  return (
    <form className="card" onSubmit={save} noValidate>
      <h2>{c.id ? `Modifier « ${initial.name} »` : 'Nouvelle gamme'}</h2>
      <Field label="Nom" value={c.name} onChange={set('name')} error={errors.name} autoFocus />
      <Field label="Adresse" value={c.slug} onChange={set('slug')} hint="Laissez vide pour la générer depuis le nom." />
      <Field label="Gamme parente" as="select" value={c.parent_id} onChange={set('parent_id')}>
        <option value="">Aucune (gamme principale)</option>
        {all.filter((x) => !x.parent_id && x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </Field>
      <Field label="Description" as="textarea" rows="3" value={c.description} onChange={set('description')} />
      <Field label="Ordre d’affichage" type="number" value={c.position} onChange={set('position')} />
      {message && <p className="alert">{message}</p>}
      <div className="row row--between">
        <div className="row">
          <button type="submit" className="btn">Enregistrer</button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>Annuler</button>
        </div>
        {c.id && <button type="button" className="link link--danger" onClick={remove}>Supprimer</button>}
      </div>
    </form>
  );
}
